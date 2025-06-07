import { spawn } from 'child_process';
import * as readline from 'readline';
import chalk from 'chalk';

export interface CommandResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class CommandExecutor {
  private rl: readline.Interface;

  constructor(rl: readline.Interface) {
    this.rl = rl;
  }

  async requestApproval(command: string, reason?: string): Promise<boolean> {
    console.log('\n' + chalk.yellow('🔐 Command Execution Request'));
    console.log(chalk.blue('Command:'), chalk.cyan(command));
    if (reason) {
      console.log(chalk.blue('Reason:'), reason);
    }
    console.log(chalk.yellow('Do you want to execute this command? (y/n/always/never)'));

    return new Promise((resolve) => {
      this.rl.question('', (answer) => {
        const response = answer.toLowerCase().trim();
        switch (response) {
          case 'y':
          case 'yes':
            console.log(chalk.green('✅ Command approved'));
            resolve(true);
            break;
          case 'always':
            console.log(chalk.green('✅ Command approved (always mode not implemented yet)'));
            resolve(true);
            break;
          case 'n':
          case 'no':
          case 'never':
          default:
            console.log(chalk.red('❌ Command rejected'));
            resolve(false);
            break;
        }
      });
    });
  }

  async executeCommand(command: string, cwd?: string): Promise<CommandResult> {
    return new Promise((resolve) => {
      console.log(chalk.dim(`🔄 Executing: ${command}`));
      
      const [cmd, ...args] = command.split(' ');
      const child = spawn(cmd, args, {
        cwd: cwd || process.cwd(),
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true
      });

      let stdout = '';
      let stderr = '';

      child.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      child.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      child.on('close', (code) => {
        const result: CommandResult = {
          success: code === 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0
        };

        if (result.success) {
          console.log(chalk.green('✅ Command completed successfully'));
          if (result.stdout) {
            console.log(chalk.dim('Output:'));
            console.log(result.stdout);
          }
        } else {
          console.log(chalk.red('❌ Command failed'));
          if (result.stderr) {
            console.log(chalk.red('Error:'), result.stderr);
          }
        }

        resolve(result);
      });

      child.on('error', (error) => {
        console.log(chalk.red('❌ Command execution error:'), error.message);
        resolve({
          success: false,
          stdout: '',
          stderr: error.message,
          exitCode: 1
        });
      });
    });
  }

  async requestAndExecute(command: string, reason?: string, cwd?: string): Promise<CommandResult | null> {
    const approved = await this.requestApproval(command, reason);
    
    if (!approved) {
      return null;
    }

    return await this.executeCommand(command, cwd);
  }

  // Safe commands that don't modify anything
  isSafeCommand(command: string): boolean {
    const safeCommands = [
      'ls', 'dir', 'pwd', 'whoami', 'date', 'find', 'grep', 'cat', 'head', 'tail',
      'wc', 'du', 'df', 'ps', 'top', 'which', 'where', 'type', 'file', 'stat',
      'git status', 'git log', 'git branch', 'git diff', 'npm list', 'node --version'
    ];

    const cmd = command.toLowerCase().trim();
    return safeCommands.some(safe => cmd.startsWith(safe));
  }
}