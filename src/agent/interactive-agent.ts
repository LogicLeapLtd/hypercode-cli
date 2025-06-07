import * as readline from 'readline';
import chalk from 'chalk';
import ora from 'ora';
import { DirectorySafety } from '../core/directory-safety';
import { ConfigManager } from '../core/config';
import { ProjectDetector } from '../core/project-detector';
import { ConversationMemory } from './conversation-memory';
import { CommandRouter } from './command-router';
import { CostTracker } from '../utils/cost-tracker';
import { CommandAutocomplete } from '../utils/command-autocomplete';
import { CommandExecutor } from '../utils/command-executor';
import { ApiKeyManager } from '../utils/api-key-manager';
import { TodoManager } from '../core/todo-manager';
import { initCommand } from '../commands/init';
import { statusCommand } from '../commands/status';
import { scopeCommand } from '../commands/scope';
import { buildCommand } from '../commands/build';
import { fixCommand } from '../commands/fix';
import { debugCommand } from '../commands/debug';
import { 
  gitCommand, 
  gitStatusCommand, 
  gitSetupCommand, 
  gitPushCommand, 
  gitBranchCommand, 
  gitCommitCommand 
} from '../commands/git';

export class InteractiveAgent {
  private rl: readline.Interface;
  private directorySafety: DirectorySafety;
  private configManager: ConfigManager;
  private memory: ConversationMemory;
  private router?: CommandRouter;
  private costTracker: CostTracker;
  private autocomplete: CommandAutocomplete;
  private commandExecutor: CommandExecutor;
  private todoManager: TodoManager;
  private apiKeyManager: ApiKeyManager;
  private isInitialized: boolean = false;
  private escapeCount: number = 0;
  private escapeTimeout?: NodeJS.Timeout;

  constructor() {
    this.directorySafety = new DirectorySafety();
    this.configManager = new ConfigManager(this.directorySafety.getProjectRoot());
    this.memory = new ConversationMemory(this.directorySafety.getProjectRoot());
    this.costTracker = new CostTracker(this.directorySafety.getProjectRoot());
    this.todoManager = new TodoManager(this.directorySafety.getProjectRoot(), this.generateSessionId());
    this.apiKeyManager = new ApiKeyManager(this.directorySafety.getProjectRoot());
    
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: this.getPrompt()
    });
    
    // Prevent readline from being closed by commands
    const originalClose = this.rl.close;
    this.rl.close = () => {
      console.log(chalk.dim('(Readline close prevented in interactive mode)'));
    };
    
    this.autocomplete = new CommandAutocomplete(this.rl);
    this.commandExecutor = new CommandExecutor(this.rl);
    this.setupExitHandling();
  }

  async start(): Promise<void> {
    const initialized = await this.initialize();
    if (initialized) {
      this.displayWelcome();
      this.startConversationLoop();
    }
  }

  private async initialize(): Promise<boolean> {
    try {
      // Initialize API key manager first, before showing spinner
      await this.apiKeyManager.initialize();
      
      // Check for API keys without spinner
      const hasApiKeys = await this.apiKeyManager.ensureApiKeys();
      
      // Now show spinner for remaining initialization
      const spinner = ora('Initializing HyperCode agent...').start();
      
      await this.memory.initialize();
      await this.memory.clearOldSessions();
      await this.costTracker.initialize();
      await this.todoManager.initialize();
      
      if (this.configManager.configExists()) {
        const config = await this.configManager.loadConfig();
        const projectDetector = new ProjectDetector(this.directorySafety.getProjectRoot());
        const projectInfo = await projectDetector.detectProject();
        
        // Check if we have an API key (from env or config)
        const openaiKey = await this.apiKeyManager.getApiKey('OPENAI_API_KEY');
        if (openaiKey) {
          this.router = new CommandRouter(config, projectInfo, this.costTracker, openaiKey);
          this.router.setCommandExecutor(this.commandExecutor);
        }
        
        this.isInitialized = true;
        spinner.succeed('HyperCode agent ready!');
      } else {
        spinner.warn('Project not initialized');
        console.log(chalk.yellow('\nRun `hypercode init` first or use the `init` command in this session.'));
        
        // Even without a project, if we have an API key, we can still use basic routing
        const openaiKey = await this.apiKeyManager.getApiKey('OPENAI_API_KEY');
        if (openaiKey) {
          // Create a minimal config for basic operations
          const minimalConfig = {
            project: { name: 'untitled', type: 'unknown', exclude: [] },
            codeStyle: { indent: '2 spaces', semicolons: true, quotes: 'single' },
            models: {
              speed: 'gpt-4o-mini',
              quality: 'gpt-4o',
              reasoning: 'gpt-4o',
              validation: 'gpt-4o-mini'
            }
          };
          const minimalProjectInfo = {
            type: 'unknown',
            language: 'unknown',
            framework: null,
            techStack: [],
            testFramework: null
          };
          
          this.router = new CommandRouter(minimalConfig as any, minimalProjectInfo as any, this.costTracker, openaiKey);
          this.router.setCommandExecutor(this.commandExecutor);
          this.isInitialized = true;
        }
      }
      
      return true;
    } catch (error) {
      // Only show spinner fail if spinner exists
      if (error instanceof Error && !error.message.includes('API key')) {
        const spinner = ora().fail('Failed to initialize agent');
      }
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      
      if (error instanceof Error && error.message.includes('Daily spending limit')) {
        console.log(chalk.red('\n💰 Daily spending limit reached. Cost management is enforced to protect your budget.'));
        process.exit(1);
      }
      
      return false;
    }
  }

  private getPrompt(): string {
    const sessionCost = this.costTracker?.getSessionTotal() || 0;
    const todoCount = this.todoManager?.getTodoCount ? this.todoManager.getTodoCount() : 0;
    
    let prompt = chalk.cyan('hypercode');
    
    if (sessionCost > 0) {
      prompt += ' ' + chalk.green(`💰 $${sessionCost.toFixed(4)}`);
    }
    
    if (todoCount > 0) {
      prompt += ' ' + chalk.yellow(`📋 ${todoCount}`);
    }
    
    prompt += chalk.cyan('> ');
    return prompt;
  }

  private updatePrompt(): void {
    this.rl.setPrompt(this.getPrompt());
  }

  private setupExitHandling(): void {
    // Handle Ctrl+C for now (disable complex escape handling temporarily)
    this.rl.on('SIGINT', () => {
      this.handleSafeExit();
    });
    
    // Simple exit handling for now
    process.on('SIGINT', () => {
      this.handleSafeExit();
    });
  }

  private async handleSafeExit(): Promise<void> {
    console.log('\n' + chalk.yellow('Are you sure you want to exit? (y/n)'));
    
    const response = await new Promise<string>((resolve) => {
      this.rl.question('', resolve);
    });

    if (response.toLowerCase() === 'y' || response.toLowerCase() === 'yes') {
      const summary = await this.costTracker.generateSessionSummary();
      console.log(summary);
      
      await this.costTracker.cleanup();
      await this.memory.saveSession();
      this.autocomplete.destroy();
      
      console.log('\n' + chalk.green('Thank you for using HyperCode! 🚀'));
      process.exit(0);
    } else {
      console.log(chalk.green('Continuing session...'));
      this.rl.prompt();
    }
  }

  private displayWelcome(): void {
    console.log('\n' + chalk.green('🚀 Welcome to HyperCode Interactive Agent!'));
    console.log(chalk.blue('Lightning-fast feature generation with conversational interface.'));
    
    if (this.isInitialized) {
      const workingDir = this.directorySafety.getWorkingDirectory();
      console.log(`\n${chalk.blue('Working in:')} ${chalk.cyan(workingDir)}`);
    }
    
    console.log('\n' + chalk.yellow('💡 New Features:'));
    console.log('  • Type "/" for command autocomplete with arrow key navigation');
    console.log('  • Real-time cost tracking: Watch your spending in the prompt');
    console.log('  • Double ESC for safe exit with cost summary');
    console.log('  • Natural language: "add user authentication", "fix the login bug"');
    
    console.log('\n' + chalk.yellow('Quick Commands:'));
    console.log('  • /help - Show detailed help');
    console.log('  • /cost - View current session costs');
    console.log('  • /status - Project information');
    console.log('  • /build <feature> - Generate code');
    console.log('  • /todo - Show current todo list');
    console.log('  • /continue - Resume from last checkpoint');
    console.log('  • /keys - Manage API keys');
    
    console.log('\n' + chalk.dim('Type "/" for autocomplete, "help" for more info, or double ESC to exit.'));
    console.log(chalk.dim('💡 Tip: Use /todo to track tasks, /continue to resume work'));
    console.log();
  }

  private startConversationLoop(): void {
    // Keep the process alive and prevent exit
    process.stdin.resume();
    
    this.rl.on('line', async (input: string) => {
      try {
        const trimmedInput = input.trim();
        
        if (!trimmedInput) {
          this.rl.prompt();
          return;
        }
        
        
        await this.handleUserInput(trimmedInput);
        this.rl.prompt();
      } catch (error) {
        console.error(chalk.red('Conversation loop error:'), error);
        this.rl.prompt();
      }
    });

    this.rl.on('close', () => {
      console.log('\n' + chalk.yellow('⚠️  Readline closed unexpectedly'));
      console.log('Stack trace:', new Error().stack);
      console.log('\n' + chalk.green('Thank you for using HyperCode! 🚀'));
      process.exit(0);
    });

    // Ensure the process stays alive
    process.stdin.setEncoding('utf8');
    
    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
      console.error(chalk.red('\n💥 Uncaught Exception:'), error);
      this.rl.prompt();
    });
    
    process.on('unhandledRejection', (reason, promise) => {
      console.error(chalk.red('\n💥 Unhandled Rejection:'), reason);
      this.rl.prompt();
    });
    
    // Start the prompt
    this.rl.prompt();
  }

  private async handleUserInput(input: string): Promise<void> {
    const lowerInput = input.toLowerCase();
    
    // Check if this is an autocomplete command
    const autoCompleteResult = this.autocomplete.processCommand(input);
    if (autoCompleteResult) {
      await this.handleAutocompleteCommand(autoCompleteResult.command, autoCompleteResult.args);
      return;
    }
    
    // Only handle as command if it starts with /
    if (!input.startsWith('/')) {
      // Handle simple file operations for natural language
      if (this.isSimpleFileOperation(input)) {
        await this.handleSimpleFileOperation(input);
        return;
      }
      
      // Otherwise treat as natural language request
      await this.handleNaturalLanguage(input);
      return;
    }
    
    // Handle special commands
    if (lowerInput === 'exit' || lowerInput === 'quit') {
      await this.handleSafeExit();
      return;
    }
    
    if (lowerInput === 'clear') {
      console.clear();
      this.displayWelcome();
      // Show todo status after clearing
      const todoCount = this.todoManager.getTodoCount();
      if (todoCount > 0) {
        console.log(chalk.yellow(`\n📋 You have ${todoCount} pending tasks. Use /todo to view them.`));
      }
      return;
    }
    
    if (lowerInput === 'help') {
      this.displayHelp();
      return;
    }

    if (lowerInput === 'cost') {
      console.log(this.costTracker.generateCostBreakdown());
      return;
    }

    try {
      // Route command intelligently if possible
      if (this.router && this.isInitialized) {
        await this.handleIntelligentRouting(input);
      } else {
        await this.handleDirectCommand(input);
      }
      
      // Update prompt with new cost
      this.updatePrompt();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    }
  }

  private async handleAutocompleteCommand(command: string, args: string): Promise<void> {
    switch (command) {
      case 'help':
        this.displayHelp();
        break;
      case 'status':
        await this.executeCommand(() => statusCommand());
        break;
      case 'scope':
        await this.executeCommand(() => scopeCommand());
        break;
      case 'init':
        await this.executeCommand(() => initCommand(args || undefined));
        break;
      case 'build':
        if (args) {
          await this.executeCommand(() => buildCommand(args, { rl: this.rl }));
        } else {
          console.log(chalk.yellow('Usage: /build <feature description>'));
        }
        break;
      case 'fix':
        if (args) {
          await this.executeCommand(() => fixCommand(args));
        } else {
          console.log(chalk.yellow('Usage: /fix <target>'));
        }
        break;
      case 'debug':
        await this.executeCommand(() => debugCommand({}));
        break;
      case 'cost':
        console.log(this.costTracker.generateCostBreakdown());
        break;
      case 'todo':
        await this.handleTodoCommand(args);
        break;
      case 'continue':
        await this.handleContinueCommand();
        break;
      case 'keys':
        await this.handleKeysCommand(args);
        break;
      case 'git':
        await this.executeCommand(() => gitCommand());
        break;
      case 'git-status':
        await this.executeCommand(() => gitStatusCommand());
        break;
      case 'git-setup':
        await this.executeCommand(() => gitSetupCommand());
        break;
      case 'git-push':
        await this.executeCommand(() => gitPushCommand());
        break;
      case 'git-branch':
        await this.executeCommand(() => gitBranchCommand(args));
        break;
      case 'git-commit':
        await this.executeCommand(() => gitCommitCommand(args));
        break;
      case 'clear':
        console.clear();
        this.displayWelcome();
        // Show todo status after clearing
        const todoCount = this.todoManager.getTodoCount();
        if (todoCount > 0) {
          console.log(chalk.yellow(`\n📋 You have ${todoCount} pending tasks. Use /todo to view them.`));
        }
        break;
      case 'exit':
      case 'quit':
        await this.handleSafeExit();
        break;
      default:
        console.log(chalk.red(`Unknown command: /${command}`));
    }
  }

  private isSimpleFileOperation(input: string): boolean {
    const lowerInput = input.toLowerCase();
    return /^(create|make|mkdir)\s+(a\s+)?(new\s+)?(folder|directory|dir)\s+(called\s+)?["']?[\w\-\.]+["']?$/i.test(input) ||
           /^(create|make|touch)\s+(a\s+)?(new\s+)?file\s+(called\s+)?["']?[\w\-\.]+["']?$/i.test(input);
  }

  private async handleSimpleFileOperation(input: string): Promise<void> {
    const lowerInput = input.toLowerCase();
    
    // Extract folder/file name
    const folderMatch = input.match(/(?:folder|directory|dir)\s+(?:called\s+)?["']?([\w\-\.]+)["']?/i);
    const fileMatch = input.match(/file\s+(?:called\s+)?["']?([\w\-\.]+)["']?/i);
    
    if (folderMatch) {
      const folderName = folderMatch[1];
      console.log(chalk.blue(`📁 Creating folder: ${folderName}`));
      
      try {
        const fs = require('fs-extra');
        await fs.ensureDir(folderName);
        console.log(chalk.green(`✅ Folder '${folderName}' created successfully!`));
      } catch (error) {
        console.error(chalk.red('❌ Failed to create folder:'), error instanceof Error ? error.message : String(error));
      }
    } else if (fileMatch) {
      const fileName = fileMatch[1];
      console.log(chalk.blue(`📄 Creating file: ${fileName}`));
      
      try {
        const fs = require('fs-extra');
        await fs.writeFile(fileName, '');
        console.log(chalk.green(`✅ File '${fileName}' created successfully!`));
      } catch (error) {
        console.error(chalk.red('❌ Failed to create file:'), error instanceof Error ? error.message : String(error));
      }
    }
  }

  private isCodebaseRelated(input: string): boolean {
    const codebaseKeywords = [
      'code', 'file', 'function', 'class', 'method', 'variable', 'bug', 'error',
      'implement', 'refactor', 'optimize', 'debug', 'test', 'component',
      'api', 'endpoint', 'database', 'model', 'controller', 'service',
      'package.json', 'tsconfig', 'config', 'dependency', 'import', 'export',
      'typescript', 'javascript', 'react', 'node', 'npm', 'yarn',
      'git', 'commit', 'branch', 'merge', 'repository', 'repo'
    ];
    
    const lowerInput = input.toLowerCase();
    return codebaseKeywords.some(keyword => lowerInput.includes(keyword)) ||
           lowerInput.includes('.ts') ||
           lowerInput.includes('.js') ||
           lowerInput.includes('.json') ||
           lowerInput.includes('src/') ||
           lowerInput.includes('this project') ||
           lowerInput.includes('this codebase');
  }

  private async handleIntelligentRouting(input: string): Promise<void> {
    const spinner = ora('Analyzing request...').start();
    
    try {
      const context = this.memory.getConversationContext();
      const intent = await this.router!.routeCommand(input, context);
      
      spinner.stop();
      
      // Only show detailed info for uncertain requests
      if (intent.confidence < 0.6) {
        console.log(chalk.yellow(`⚠️  Uncertain request (${Math.round(intent.confidence * 100)}% confidence)`));
      }

      let response = '';
      
      switch (intent.action) {
        case 'init':
          await this.executeCommand(() => initCommand(intent.parameters?.projectType));
          // Reinitialize to load new config
          await this.initialize();
          break;
          
        case 'status':
          await this.executeCommand(() => statusCommand());
          break;
          
        case 'scope':
          await this.executeCommand(() => scopeCommand());
          break;
          
        case 'build':
          if (intent.parameters?.feature) {
            const buildOptions = { ...(intent.parameters?.options || {}), rl: this.rl };
            await this.executeCommand(() => buildCommand(intent.parameters!.feature!, buildOptions));
          } else {
            response = 'Please specify what feature you want me to build.';
          }
          break;
          
        case 'fix':
          if (intent.parameters?.target) {
            await this.executeCommand(() => fixCommand(intent.parameters!.target!));
          } else {
            response = 'Please specify what you want me to fix.';
          }
          break;
          
        case 'debug':
          await this.executeCommand(() => debugCommand(intent.parameters?.options || {}));
          break;
          
        case 'help':
          this.displayHelp();
          break;
          
        case 'chat':
        default:
          response = await this.router!.generateResponse(input, context);
          break;
      }
      
      // Only show response for chat actions, other actions show their own output
      if (intent.action === 'chat' && response) {
        console.log(chalk.green('\n💬 ') + response);
      }
      
      await this.memory.addTurn(input, response, intent.action, {
        confidence: intent.confidence,
        reasoning: intent.reasoning
      });
      
    } catch (error) {
      spinner.fail('Request processing failed');
      
      if (error instanceof Error) {
        // Handle specific error types
        if (error.message.includes('API key')) {
          console.error(chalk.red('🔑 API Key Error:'), 'Please check your OpenAI API key configuration');
          console.log(chalk.yellow('Set OPENAI_API_KEY environment variable or check your key validity'));
        } else if (error.message.includes('rate limit')) {
          console.error(chalk.red('⚡ Rate Limit:'), 'API rate limit exceeded');
          console.log(chalk.yellow('Please wait a moment before trying again'));
        } else if (error.message.includes('network') || error.message.includes('timeout')) {
          console.error(chalk.red('🌐 Network Error:'), 'Connection issue detected');
          console.log(chalk.yellow('Please check your internet connection and try again'));
        } else if (error.message.includes('Daily spending limit')) {
          console.error(chalk.red('💰 Spending Limit:'), error.message);
          console.log(chalk.yellow('Increase your daily limit in configuration or wait until tomorrow'));
        } else {
          console.error(chalk.red('Error:'), error.message);
        }
      } else {
        console.error(chalk.red('Unknown Error:'), String(error));
      }
      
      // Suggest recovery actions
      console.log(chalk.dim('\n💡 You can try:'));
      console.log(chalk.dim('  • Simplifying your request'));
      console.log(chalk.dim('  • Using a direct command like /status or /help'));
      console.log(chalk.dim('  • Checking your configuration with /cost'));
    }
  }

  private async handleDirectCommand(input: string): Promise<void> {
    const parts = input.split(' ');
    const command = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    let response = '';
    
    // Handle direct commands without slash
    switch (command) {
      case 'help':
        this.displayHelp();
        return;
        
      case 'clear':
        console.clear();
        this.displayWelcome();
        const todoCount = this.todoManager.getTodoCount();
        if (todoCount > 0) {
          console.log(chalk.yellow(`\n📋 You have ${todoCount} pending tasks. Use /todo to view them.`));
        }
        return;
        
      case 'exit':
      case 'quit':
        await this.handleSafeExit();
        return;
        
      case 'init':
        await this.executeCommand(() => initCommand(args[0]));
        response = 'Project initialization completed.';
        // Reinitialize after project init to load the new config
        await this.initialize();
        break;
        
      case 'status':
        await this.executeCommand(() => statusCommand());
        response = 'Project status displayed above.';
        break;
        
      case 'scope':
        await this.executeCommand(() => scopeCommand());
        response = 'Project scope displayed above.';
        break;
        
      case 'build':
        if (args.length > 0) {
          const feature = args.join(' ');
          await this.executeCommand(() => buildCommand(feature, { rl: this.rl }));
          response = `Build command executed for: ${feature}`;
        } else {
          response = 'Usage: build <feature description>';
        }
        break;
        
      case 'fix':
        if (args.length > 0) {
          const target = args.join(' ');
          await this.executeCommand(() => fixCommand(target));
          response = `Fix command executed for: ${target}`;
        } else {
          response = 'Usage: fix <target>';
        }
        break;
        
      case 'debug':
        await this.executeCommand(() => debugCommand({}));
        response = 'Debug information displayed above.';
        break;
        
      default:
        // If not a direct command, treat as natural language
        await this.handleNaturalLanguage(input);
        return;
    }
    
    if (response) {
      console.log(chalk.green('\n💬 ') + response);
    }
    
    await this.memory.addTurn(input, response, command);
  }

  private async executeCommand(commandFn: () => Promise<void>): Promise<void> {
    try {
      await commandFn();
    } catch (error) {
      console.error(chalk.red('Command failed:'), error instanceof Error ? error.message : String(error));
    }
  }

  private displayHelp(): void {
    console.log(chalk.green('\n📚 HyperCode Interactive Agent Help\n'));
    
    console.log(chalk.blue('Natural Language Examples:'));
    console.log('  • "add user authentication system"');
    console.log('  • "fix the login bug in auth.ts"');
    console.log('  • "show me the project status"');
    console.log('  • "what files are in scope?"');
    console.log('  • Just type naturally - no commands needed!');
    
    console.log('\n' + chalk.blue('All Available Commands (type / to see autocomplete):'));
    console.log(chalk.yellow('  Project Management:'));
    console.log('  /init [type]     - Initialize project');
    console.log('  /status          - Show project status');
    console.log('  /scope           - List files in scope');
    
    console.log(chalk.yellow('\n  Code Generation:'));
    console.log('  /build <feature> - Generate complete feature');
    console.log('  /fix <target>    - Fix specific issues');
    console.log('  /debug           - Show debug information');
    
    console.log(chalk.yellow('\n  Task Management:'));
    console.log('  /todo            - Show current todo list');
    console.log('  /todo add <task> - Add new todo item');
    console.log('  /todo complete <id> - Mark todo as completed');
    console.log('  /todo skip <id>  - Skip todo item');
    console.log('  /todo progress   - Show progress summary');
    console.log('  /todo checkpoint - Save current state');
    console.log('  /continue        - Resume from last checkpoint');
    
    console.log(chalk.yellow('\n  Git Integration:'));
    console.log('  /git             - Git menu');
    console.log('  /git-status      - Show git status');
    console.log('  /git-setup       - Configure git');
    console.log('  /git-push        - Push to remote');
    console.log('  /git-branch <name> - Create branch');
    console.log('  /git-commit <msg> - Commit changes');
    
    console.log(chalk.yellow('\n  Configuration:'));
    console.log('  /keys            - List API key status');
    console.log('  /keys add <KEY>  - Add API key');
    console.log('  /keys remove <KEY> - Remove API key');
    console.log('  /cost            - Show session costs');
    
    console.log(chalk.yellow('\n  General:'));
    console.log('  /help            - Show this help');
    console.log('  /clear           - Clear screen');
    console.log('  /exit            - Exit HyperCode');
    
    console.log('\n' + chalk.green('💡 Tips:'));
    console.log('  • Type "/" at the start of a line for command autocomplete');
    console.log('  • Use arrow keys to navigate autocomplete suggestions');
    console.log('  • Press ESC to cancel autocomplete');
    console.log('  • Just type normally for natural language requests');
  }

  private async handleTodoCommand(args: string): Promise<void> {
    const parts = args.trim().split(' ');
    const subcommand = parts[0]?.toLowerCase();

    try {
      switch (subcommand) {
        case 'add':
          if (parts.length < 2) {
            console.log(chalk.yellow('Usage: /todo add <task description>'));
            return;
          }
          const task = parts.slice(1).join(' ');
          const todoId = await this.todoManager.addTodo(task);
          console.log(chalk.green(`✅ Added todo: ${task}`));
          console.log(chalk.dim(`   ID: ${todoId}`));
          break;

        case 'complete':
          if (parts.length < 2) {
            console.log(chalk.yellow('Usage: /todo complete <todo-id>'));
            return;
          }
          await this.todoManager.updateTodoStatus(parts[1], 'completed');
          console.log(chalk.green(`✅ Todo marked as completed`));
          break;

        case 'skip':
          if (parts.length < 2) {
            console.log(chalk.yellow('Usage: /todo skip <todo-id> [reason]'));
            return;
          }
          const reason = parts.slice(2).join(' ') || undefined;
          await this.todoManager.skipTodo(parts[1], reason);
          break;

        case 'progress':
          const progress = await this.todoManager.getProgress();
          console.log(chalk.blue('\n📊 Todo Progress:'));
          console.log(`  Completed: ${progress.completed}/${progress.total} (${progress.percentage}%)`);
          console.log(`  In Progress: ${progress.inProgress}`);
          console.log(`  Pending: ${progress.pending}`);
          if (progress.estimatedTokensRemaining > 0) {
            console.log(`  Estimated tokens remaining: ~${progress.estimatedTokensRemaining}`);
          }
          break;

        case 'checkpoint':
          await this.todoManager.saveCheckpoint();
          break;

        default:
          // Default: show todo list
          const todoList = this.todoManager.formatTodoList();
          if (todoList.trim()) {
            console.log(chalk.blue('\n📋 Current Todo List:'));
            console.log(todoList);
          } else {
            console.log(chalk.dim('No todos found. Use "/todo add <task>" to create one.'));
          }
          break;
      }
    } catch (error) {
      console.error(chalk.red('Todo command failed:'), error instanceof Error ? error.message : String(error));
    }
  }

  private async handleContinueCommand(): Promise<void> {
    try {
      const currentTodo = await this.todoManager.continueFromLastCheckpoint();
      
      if (!currentTodo) {
        console.log(chalk.yellow('🎉 No pending todos found! All tasks completed.'));
        const progress = await this.todoManager.getProgress();
        if (progress.total > 0) {
          console.log(chalk.green(`✅ Completed ${progress.completed}/${progress.total} tasks (${progress.percentage}%)`));
        }
        return;
      }

      console.log(chalk.blue(`🔄 Continuing with: ${currentTodo.title}`));
      if (currentTodo.description) {
        console.log(chalk.dim(`   ${currentTodo.description}`));
      }

      // Here you could integrate with the build command or other task execution
      console.log(chalk.yellow('💡 Use natural language or specific commands to work on this task.'));
      console.log(chalk.dim('   Mark as completed with: /todo complete ' + currentTodo.id));
      
    } catch (error) {
      console.error(chalk.red('Continue command failed:'), error instanceof Error ? error.message : String(error));
    }
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private async handleNaturalLanguage(input: string): Promise<void> {
    try {
      // Route command intelligently if possible
      if (this.router && this.isInitialized) {
        await this.handleIntelligentRouting(input);
      } else {
        // No router available, provide helpful response
        console.log(chalk.yellow('\n💡 Natural language processing requires API configuration.'));
        console.log(chalk.blue('Use /keys add OPENAI_API_KEY to set up.'));
        console.log(chalk.dim('Or use direct commands like /status, /build, etc.'));
      }
      
      // Update prompt with new cost
      this.updatePrompt();
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    }
  }

  private async handleKeysCommand(args: string): Promise<void> {
    const parts = args.trim().split(' ');
    const subcommand = parts[0]?.toLowerCase();

    try {
      switch (subcommand) {
        case 'add':
          const keyName = parts[1]?.toUpperCase();
          if (!keyName) {
            console.log(chalk.yellow('Usage: /keys add <KEY_NAME>'));
            console.log(chalk.dim('Example: /keys add OPENAI_API_KEY'));
            return;
          }
          
          const descriptions: Record<string, string> = {
            'OPENAI_API_KEY': 'Required for intelligent command routing and code generation.\nGet your key at: https://platform.openai.com/api-keys',
            'ANTHROPIC_API_KEY': 'For Claude model integration.\nGet your key at: https://console.anthropic.com/api-keys',
            'DEEPSEEK_API_KEY': 'For DeepSeek model integration.\nGet your key at: https://platform.deepseek.com'
          };
          
          const description = descriptions[keyName] || `API key for ${keyName}`;
          await this.apiKeyManager.promptForApiKey(keyName, description);
          
          // Reinitialize router if OpenAI key was added
          if (keyName === 'OPENAI_API_KEY' && !this.router) {
            console.log(chalk.blue('🔄 Initializing AI features...'));
            
            // Create minimal config if no project
            if (!this.configManager.configExists()) {
              const minimalConfig = {
                project: { name: 'untitled', type: 'unknown', exclude: [] },
                codeStyle: { indent: '2 spaces', semicolons: true, quotes: 'single' },
                models: {
                  speed: 'gpt-4o-mini',
                  quality: 'gpt-4o',
                  reasoning: 'gpt-4o',
                  validation: 'gpt-4o-mini'
                }
              };
              const minimalProjectInfo = {
                type: 'unknown',
                language: 'unknown',
                framework: null,
                techStack: [],
                testFramework: null
              };
              
              this.router = new CommandRouter(minimalConfig as any, minimalProjectInfo as any, this.costTracker, process.env.OPENAI_API_KEY!);
              this.router.setCommandExecutor(this.commandExecutor);
              console.log(chalk.green('✅ AI features enabled!'));
            } else {
              await this.initialize();
            }
          }
          break;

        case 'remove':
          const removeKey = parts[1]?.toUpperCase();
          if (!removeKey) {
            console.log(chalk.yellow('Usage: /keys remove <KEY_NAME>'));
            return;
          }
          await this.apiKeyManager.removeApiKey(removeKey);
          break;

        case 'list':
        default:
          await this.apiKeyManager.listApiKeys();
          break;
      }
    } catch (error) {
      console.error(chalk.red('Keys command failed:'), error instanceof Error ? error.message : String(error));
    }
  }
}