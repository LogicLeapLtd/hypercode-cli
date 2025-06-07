import OpenAI from 'openai';
import chalk from 'chalk';
import { HyperCodeConfig } from '../core/config';
import { ProjectInfo } from '../core/project-detector';
import { CostTracker } from '../utils/cost-tracker';
import { CommandExecutor } from '../utils/command-executor';

export interface CommandIntent {
  action: 'init' | 'status' | 'scope' | 'build' | 'fix' | 'debug' | 'chat' | 'help';
  parameters?: {
    feature?: string;
    target?: string;
    projectType?: string;
    options?: Record<string, boolean>;
  };
  confidence: number;
  reasoning: string;
  cost?: {
    inputTokens: number;
    outputTokens: number;
    totalCost: number;
  };
}

export class CommandRouter {
  private openai: OpenAI;
  private config: HyperCodeConfig;
  private projectInfo: ProjectInfo;
  private costTracker: CostTracker;
  private commandExecutor?: CommandExecutor;

  constructor(config: HyperCodeConfig, projectInfo: ProjectInfo, costTracker: CostTracker, apiKey?: string) {
    this.config = config;
    this.projectInfo = projectInfo;
    this.costTracker = costTracker;
    
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (!key) {
      throw new Error('OPENAI_API_KEY environment variable is required');
    }
    
    this.openai = new OpenAI({
      apiKey: key
    });
  }

  setCommandExecutor(executor: CommandExecutor): void {
    this.commandExecutor = executor;
  }

  private isSimpleTask(userInput: string): boolean {
    const simplePatterns = [
      /^(hi|hello|hey|how are you|status|help)$/i,
      /^(what is|what's|show me)\s+/i,
      /^(list|display|show)\s+(files|status|scope|help)/i,
      /^(thank you|thanks|bye|goodbye|exit|quit)$/i
    ];
    
    return simplePatterns.some(pattern => pattern.test(userInput.trim()));
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

  private routeSimpleTask(userInput: string): CommandIntent {
    const input = userInput.toLowerCase().trim();
    
    if (/^(hi|hello|hey|how are you)/.test(input)) {
      return {
        action: 'chat',
        confidence: 1.0,
        reasoning: 'Simple greeting detected, using chat response'
      };
    }
    
    if (/^(status|show me status)/.test(input)) {
      return {
        action: 'status',
        confidence: 1.0,
        reasoning: 'Status request detected'
      };
    }
    
    if (/^(help|show me help)/.test(input)) {
      return {
        action: 'help',
        confidence: 1.0,
        reasoning: 'Help request detected'
      };
    }
    
    if (/(files|scope)/.test(input)) {
      return {
        action: 'scope',
        confidence: 1.0,
        reasoning: 'File scope request detected'
      };
    }
    
    // Default to chat for other simple interactions
    return {
      action: 'chat',
      confidence: 0.9,
      reasoning: 'Simple interaction, using chat response'
    };
  }

  async routeCommand(userInput: string, conversationContext: string): Promise<CommandIntent> {
    // For simple tasks, use direct routing without API calls
    if (this.isSimpleTask(userInput)) {
      return this.routeSimpleTask(userInput);
    }
    
    const systemPrompt = this.buildSystemPrompt();
    const fullInput = `Context: ${conversationContext}\n\nUser Input: ${userInput}`;
    
    // Estimate cost before making the call
    const estimate = this.costTracker.estimateCostBeforeCall(
      'openai',
      'gpt-4.1-mini',
      systemPrompt + fullInput,
      300
    );
    
    // Show cost warning for expensive operations
    if (await this.costTracker.checkCostWarning(estimate.estimatedCost)) {
      console.log(chalk.yellow(`⚠️  Estimated cost: $${estimate.estimatedCost.toFixed(4)} (${estimate.estimatedInputTokens} in + ${estimate.estimatedOutputTokens} out)`));
    }
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini', // Fast routing model
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Context: ${conversationContext}\n\nUser Input: ${userInput}` }
        ],
        temperature: 0.1,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No response from routing model');
      }

      // Track cost
      const cost = await this.costTracker.trackModelUsage(
        'openai',
        'gpt-4.1-mini',
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens || 0
      );

      const intent = this.parseRouterResponse(content);
      intent.cost = {
        inputTokens: response.usage?.prompt_tokens || 0,
        outputTokens: response.usage?.completion_tokens || 0,
        totalCost: cost.cost
      };

      return intent;
    } catch (error) {
      console.warn('Router failed, falling back to chat mode:', error);
      return {
        action: 'chat',
        confidence: 0.5,
        reasoning: 'Router failed, defaulting to conversational mode'
      };
    }
  }

  private buildSystemPrompt(): string {
    return `You are HyperCode's command router. Analyze user input and determine the best action.

Project Context:
- Type: ${this.projectInfo.type}
- Language: ${this.projectInfo.language}
- Framework: ${this.projectInfo.framework || 'none'}
- Tech Stack: ${this.projectInfo.techStack.join(', ')}

Available Actions:
1. "init" - Initialize/setup project (keywords: setup, initialize, configure, start)
2. "status" - Show project status (keywords: status, info, current, what, where)
3. "scope" - List files in scope (keywords: files, scope, what files, show files)
4. "build" - Generate features/code (keywords: create, build, add, implement, generate, make)
5. "fix" - Fix issues/errors (keywords: fix, error, bug, broken, problem, issue)
6. "debug" - Debug/analyze (keywords: debug, analyze, trace, confidence, why)
7. "chat" - General conversation (questions, explanations, help)
8. "help" - Show help (keywords: help, how, usage, commands)

Respond with JSON:
{
  "action": "action_name",
  "parameters": {
    "feature": "description for build actions",
    "target": "file/error for fix actions", 
    "projectType": "type for init actions",
    "options": {"debug": true}
  },
  "confidence": 0.95,
  "reasoning": "Why this action was chosen"
}

Examples:
- "add user authentication" → build action with feature parameter
- "what's wrong with auth.ts?" → fix action with target parameter  
- "show me the current project status" → status action
- "what files are included?" → scope action`;
  }

  private parseRouterResponse(content: string): CommandIntent {
    try {
      const parsed = JSON.parse(content);
      
      return {
        action: parsed.action || 'chat',
        parameters: parsed.parameters || {},
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'Parsed from router response'
      };
    } catch (error) {
      console.warn('Failed to parse router response:', content);
      return {
        action: 'chat',
        confidence: 0.3,
        reasoning: 'Failed to parse router response, defaulting to chat'
      };
    }
  }

  async generateResponse(userInput: string, conversationContext: string): Promise<string> {
    const systemPrompt = this.buildChatSystemPrompt();
    const fullInput = conversationContext ? 
      `Context: ${conversationContext}\n\nUser: ${userInput}` : 
      userInput;
    
    // Estimate cost before making the call
    const estimate = this.costTracker.estimateCostBeforeCall(
      'openai',
      'gpt-4.1-mini',
      systemPrompt + fullInput,
      500
    );
    
    // Show cost estimation for expensive operations
    if (await this.costTracker.checkCostWarning(estimate.estimatedCost)) {
      console.log(chalk.yellow(`⚠️  Chat estimated cost: $${estimate.estimatedCost.toFixed(4)}`));
    }
    
    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4.1-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: fullInput }
        ],
        temperature: 0.7,
        max_tokens: 500
      });

      // Track cost and display usage
      const cost = await this.costTracker.trackModelUsage(
        'openai',
        'gpt-4.1-mini',
        response.usage?.prompt_tokens || 0,
        response.usage?.completion_tokens || 0
      );
      
      console.log(chalk.dim(`📊 gpt-4.1-mini: ${cost.tokens.inputTokens} in + ${cost.tokens.outputTokens} out = $${cost.cost.toFixed(4)}`));

      const content = response.choices[0]?.message?.content || 'I apologize, but I encountered an issue generating a response.';
      
      // Check for command execution requests
      const processedContent = await this.processCommandRequests(content);
      
      return processedContent;
    } catch (error) {
      console.error('Chat generation failed:', error);
      return 'I apologize, but I encountered an issue generating a response. Please try again.';
    }
  }

  private async processCommandRequests(content: string): Promise<string> {
    if (!this.commandExecutor) {
      return content;
    }

    // Look for EXECUTE_COMMAND[command] patterns
    const commandPattern = /EXECUTE_COMMAND\[([^\]]+)\]/g;
    let matches = content.match(commandPattern);
    
    if (!matches) {
      return content;
    }

    let processedContent = content;
    
    for (const match of matches) {
      const commandMatch = match.match(/EXECUTE_COMMAND\[([^\]]+)\]/);
      if (commandMatch) {
        const command = commandMatch[1];
        
        console.log(chalk.blue(`\n🤖 AI wants to run: ${command}`));
        
        const result = await this.commandExecutor.requestAndExecute(
          command,
          "AI needs this to better understand your project context"
        );
        
        if (result && result.success) {
          // Replace the command request with the output
          const replacement = `\n\`\`\`\n$ ${command}\n${result.stdout}\n\`\`\`\n`;
          processedContent = processedContent.replace(match, replacement);
        } else {
          // Replace with indication that command failed or was rejected
          const replacement = result === null 
            ? `\n[Command "${command}" was not approved by user]\n`
            : `\n[Command "${command}" failed: ${result.stderr}]\n`;
          processedContent = processedContent.replace(match, replacement);
        }
      }
    }
    
    return processedContent;
  }

  private buildChatSystemPrompt(): string {
    return `You are HyperCode, a CLI coding agent that can execute shell commands with user approval.

COMMAND EXECUTION:
- You can suggest and request shell commands to gather context
- Use EXECUTE_COMMAND[command] to request command execution
- Safe commands (ls, grep, find, cat, etc.) are encouraged for gathering project context
- Always explain why you want to run a command

Examples:
- To explore project structure: EXECUTE_COMMAND[find . -name "*.ts" -type f | head -10]
- To search for patterns: EXECUTE_COMMAND[grep -r "function" src/]
- To see current directory: EXECUTE_COMMAND[ls -la]

Be helpful and use commands to better understand the user's codebase before providing advice.`;
  }
}