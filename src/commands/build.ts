import chalk from 'chalk';
import ora from 'ora';
import { DirectorySafety } from '../core/directory-safety';
import { ConfigManager } from '../core/config';
import { ProjectDetector } from '../core/project-detector';
import { MultiModelOrchestrator } from '../models/multi-model-orchestrator';
import { ModelClient } from '../models/model-client';
import { FileGenerator } from '../core/file-generator';
import { ApprovalManager } from '../utils/approval-manager';
import { CostTracker } from '../utils/cost-tracker';
import { TodoManager } from '../core/todo-manager';
import { ApiKeyManager } from '../utils/api-key-manager';
import * as readline from 'readline';

export async function buildCommand(feature: string, options: { debug?: boolean, rl?: any }): Promise<void> {
  const spinner = ora('Preparing to build feature...').start();
  
  try {
    const directorySafety = new DirectorySafety();
    const projectRoot = directorySafety.getProjectRoot();
    const configManager = new ConfigManager(projectRoot);
    
    if (!configManager.configExists()) {
      spinner.fail('HyperCode not initialized');
      console.log(chalk.yellow('Run `hypercode init` first to set up your project.'));
      return;
    }
    
    spinner.text = 'Loading project configuration...';
    const config = await configManager.loadConfig();
    
    spinner.text = 'Analyzing project structure...';
    const files = await directorySafety.getSafeFileList();
    const projectDetector = new ProjectDetector(projectRoot);
    const projectInfo = await projectDetector.detectProject();
    
    spinner.stop();
    
    console.log(chalk.green('🚀 Building Feature\n'));
    console.log(`${chalk.blue('Feature:')} ${chalk.cyan(feature)}`);
    console.log(`${chalk.blue('Project:')} ${config.project.name} (${config.project.type})`);
    console.log(`${chalk.blue('Files in scope:')} ${files.length}`);
    
    if (options.debug) {
      console.log('\n' + chalk.yellow('🐛 Debug mode enabled'));
      console.log(`${chalk.blue('Models:')} Speed: ${config.models.speed}, Quality: ${config.models.quality}`);
    }

    try {
      // Initialize file generator, cost tracker, and todo manager
      const fileGenerator = new FileGenerator(projectRoot);
      const costTracker = new CostTracker(projectRoot);
      const todoManager = new TodoManager(projectRoot, `build_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);
      await fileGenerator.initialize();
      await costTracker.initialize();
      await todoManager.initialize();

      // Get API key from environment or stored config
      const apiKeyManager = new ApiKeyManager(projectRoot);
      await apiKeyManager.initialize();
      const apiKey = await apiKeyManager.getApiKey('OPENAI_API_KEY');
      
      if (!apiKey) {
        console.error(chalk.red('❌ OpenAI API key not found. Set OPENAI_API_KEY or use /keys add OPENAI_API_KEY'));
        return;
      }
      
      const orchestrator = new MultiModelOrchestrator(config, projectInfo, costTracker, apiKey);
      
      const result = await orchestrator.orchestrate({
        task: 'build',
        prompt: feature,
        context: {
          projectInfo,
          config,
          files: [] // Don't send all files - use embedding/smart selection later
        },
        options: {
          debug: options.debug,
          parallel: false // Disable parallel since we only use one model
        }
      });

      // Check if AI suggests running a command instead of generating files
      if (result.primaryResponse.includes('COMMAND_REQUIRED:')) {
        const commandMatch = result.primaryResponse.match(/COMMAND_REQUIRED:\s*(.+)/);
        if (commandMatch) {
          const command = commandMatch[1].trim();
          console.log(chalk.blue(`\n💡 AI suggests running: ${command}`));
          
          // Use existing readline interface if provided, otherwise create new one  
          const rl = options.rl || readline.createInterface({
            input: process.stdin,
            output: process.stdout
          });

          const approvalManager = new ApprovalManager(rl);
          const response = await approvalManager.askQuestion(`Run this command? (y/n): `);
          
          if (response.toLowerCase().trim() === 'y' || response.toLowerCase().trim() === 'yes') {
            const args = command.split(' ');
            const cmd = args[0];
            const cmdArgs = args.slice(1);
            
            const { spawn } = require('child_process');
            console.log(chalk.green(`\n🚀 Running: ${command}`));
            
            return new Promise<void>((resolve) => {
              const child = spawn(cmd, cmdArgs, {
                stdio: 'inherit',
                cwd: process.cwd()
              });
              
              child.on('close', (code: number) => {
                if (code === 0) {
                  console.log(chalk.green('\n✅ Command completed successfully!'));
                } else {
                  console.log(chalk.red('\n❌ Command failed'));
                }
                
                // Only close readline if we created it ourselves
                if (!options.rl) {
                  rl.close();
                }
                resolve();
              });
            });
          }
          
          // Never close readline in interactive mode - let interactive agent handle it
          return;
        }
      }

      // Debug: Log what the AI actually returned
      if (options.debug) {
        console.log(chalk.yellow('\n🐛 AI Response:'));
        console.log(result.primaryResponse);
        console.log(chalk.yellow('\n🐛 Response length:'), result.primaryResponse.length);
      }

      // Generate file creation plan
      const plan = await fileGenerator.createGenerationPlan(
        feature,
        result.primaryResponse,
        result.processingTime * 0.001 // Convert to cost estimate
      );

      // Create todo group and generate todo list for the feature
      console.log(chalk.blue('\n📋 Generating todo list for feature...'));
      const groupId = await todoManager.createTodoGroup(
        `Building: ${feature}`,
        `Complete implementation of ${feature}`,
        plan.estimatedCost
      );

      // Generate AI-powered todos from the plan
      const todos = await generateAITodosFromPlan(plan, feature, apiKey);
      for (const todo of todos) {
        await todoManager.addTodo(todo.title, {
          description: todo.description,
          priority: todo.priority,
          estimatedTokens: todo.estimatedTokens,
          groupId
        });
      }

      // Show the todo list
      console.log(chalk.blue('\n📋 Implementation Plan:'));
      console.log(todoManager.formatTodoList(groupId));

      // Use existing readline interface if provided, otherwise create new one  
      const rl = options.rl || readline.createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const approvalManager = new ApprovalManager(rl);

      // Check if we actually have files to generate
      if (plan.files.length === 0) {
        console.log(chalk.red('\n❌ No code files generated by AI.'));
        console.log(chalk.yellow('This indicates an issue with the AI response format.'));
        console.log(chalk.blue('\n💡 Try being more specific about what files you want created.'));
        console.log(chalk.dim('Session continues...'));
        return;
      }

      
      approvalManager.showGenerationPlan(plan.files, plan.feature);
      approvalManager.showGenerationSummary(
        plan.files,
        plan.estimatedCost,
        plan.gitStrategy,
        plan.branchName
      );

      if (options.debug && result.debug) {
        console.log('\n' + chalk.yellow('🐛 Debug Information:'));
        console.log(result.debug.reasoning);
        
        if (result.debug.alternatives.length > 0) {
          console.log('\n' + chalk.blue('🔄 Alternative Approaches:'));
          result.debug.alternatives.forEach((alt, index) => {
            console.log(`\n${chalk.cyan(`Option ${index + 1}:`)}\n${alt.slice(0, 200)}...`);
          });
        }
      }

      // Ask for confirmation
      const shouldProceed = await approvalManager.confirmGeneration();
      
      if (!shouldProceed) {
        console.log(chalk.yellow('\n⏹️  Generation cancelled by user.'));
        console.log(chalk.blue('\n💡 Todo list saved for later. Use `/continue` to resume.'));
        // Never close readline in interactive mode - let interactive agent handle it
        return;
      }

      // Show controls help
      approvalManager.showControlsHelp();

      // Execute file generation with step-by-step approval and todo tracking
      const generationResult = await fileGenerator.executeGenerationPlan(
        plan,
        async (operation) => {
          const approval = await approvalManager.requestApproval(
            operation,
            plan.files.indexOf(operation) + 1,
            plan.files.length
          );
          
          // Update todo status when file operations complete
          if (approval) {
            // Find corresponding todo and mark as in progress or completed
            // This could be enhanced to match operation to specific todo items
          }
          
          return approval;
        }
      );

      // Display completion summary
      approvalManager.displayCompletionSummary(
        generationResult.filesCreated,
        generationResult.filesModified,
        generationResult.filesSkipped,
        generationResult.errors
      );

      // Show git information if applicable
      if (generationResult.branchCreated) {
        console.log(chalk.green(`🌿 Created branch: ${generationResult.branchCreated}`));
      }
      
      if (generationResult.gitCommit) {
        console.log(chalk.green(`📝 Auto-committed: "${generationResult.gitCommit}"`));
      }

      if (options.debug) {
        console.log(`\n${chalk.green('📊 Generation Stats:')}`);
        console.log(`  Time: ${result.processingTime}ms`);
        console.log(`  Confidence: ${Math.round(result.confidence * 100)}%`);
        console.log(`  Models used: ${Array.from(result.modelResponses.keys()).join(', ')}`);
        
        if (result.consensus) {
          console.log(`  Consensus: ${Math.round(result.consensus.agreement * 100)}%`);
        }
      }

      // Show cost breakdown
      console.log('\n' + costTracker.generateCostBreakdown());

      // Show next steps for the user
      if (generationResult.success && (generationResult.filesCreated.length > 0 || generationResult.filesModified.length > 0)) {
        console.log(chalk.green('\n🎉 Build completed successfully!'));
        console.log(chalk.blue('\n💡 Next steps:'));
        console.log('  • Run tests to verify everything works');
        console.log('  • Use /git-status to see changes');
        console.log('  • Use /git-commit to commit your changes');
        console.log('  • Use /todo to track remaining tasks');
      }

      // Never close readline in interactive mode - let interactive agent handle it

    } catch (error) {
      if (error instanceof Error && error.message.includes('API key')) {
        console.log('\\n' + chalk.yellow('⚠️  AI model integration requires API keys'));
        console.log('\\nSet environment variables:');
        console.log('  • OPENAI_API_KEY - For GPT models');
        console.log('  • ANTHROPIC_API_KEY - For Claude models');
        console.log('  • DEEPSEEK_API_KEY - For DeepSeek models');
        console.log('\\nAt least one API key is required for feature generation.');
      } else {
        throw error;
      }
    }
    
  } catch (error) {
    spinner.fail('Build failed');
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    throw error;
  }
}

async function generateAITodosFromPlan(plan: any, feature: string, apiKey: string): Promise<Array<{
  title: string;
  description?: string;
  priority: 'low' | 'medium' | 'high';
  estimatedTokens?: number;
}>> {
  const modelClient = new ModelClient(apiKey);
  
  const prompt = `Generate a detailed todo list for implementing: "${feature}"

Files to be created/modified:
${plan.files.map((f: any) => `- ${f.operation}: ${f.path} (${f.description || 'no description'})`).join('\n')}

Generate 5-8 specific, actionable todo items. Each should be a concrete development step.

Return JSON array:
[
  {
    "title": "Specific actionable task",
    "description": "Detailed description of what to do",
    "priority": "high|medium|low",
    "estimatedTokens": 500
  }
]

Make tasks specific to the feature being built, not generic placeholders.`;

  try {
    const response = await modelClient.generateResponse('speed', 
      'You are a software development expert. Generate specific, actionable todo lists for development tasks.',
      prompt
    );
    
    const todos = JSON.parse(response.content);
    return todos.map((todo: any) => ({
      title: todo.title,
      description: todo.description,
      priority: ['low', 'medium', 'high'].includes(todo.priority) ? todo.priority : 'medium',
      estimatedTokens: todo.estimatedTokens || 500
    }));
  } catch (error) {
    console.warn('Failed to generate AI todos, using fallback');
    // Minimal fallback
    return [{
      title: `Implement ${feature}`,
      description: `Build the ${feature} feature`,
      priority: 'high' as const,
      estimatedTokens: 1000
    }];
  }
}