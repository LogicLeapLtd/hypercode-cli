import chalk from 'chalk';
import * as readline from 'readline';

export interface Command {
  command: string;
  description: string;
  aliases?: string[];
}

export const AVAILABLE_COMMANDS: Command[] = [
  { command: '/help', description: 'Show help information', aliases: ['/h'] },
  { command: '/status', description: 'Show project status', aliases: ['/st'] },
  { command: '/scope', description: 'List files in scope', aliases: ['/sc'] },
  { command: '/build', description: 'Generate features', aliases: ['/b'] },
  { command: '/fix', description: 'Fix issues and bugs', aliases: ['/f'] },
  { command: '/debug', description: 'Enter debug mode', aliases: ['/d'] },
  { command: '/init', description: 'Initialize project', aliases: ['/i'] },
  { command: '/cost', description: 'Show cost breakdown', aliases: ['/c'] },
  { command: '/todo', description: 'Manage todo list', aliases: ['/t'] },
  { command: '/continue', description: 'Resume from last checkpoint', aliases: ['/cont'] },
  { command: '/keys', description: 'Manage API keys', aliases: ['/k'] },
  { command: '/git', description: 'Git integration commands', aliases: ['/g'] },
  { command: '/git-status', description: 'Show git and HyperCode status', aliases: ['/gs'] },
  { command: '/git-setup', description: 'Configure git integration', aliases: ['/gset'] },
  { command: '/git-push', description: 'Push changes to remote', aliases: ['/gp'] },
  { command: '/git-branch', description: 'Create new branch', aliases: ['/gb'] },
  { command: '/git-commit', description: 'Manual commit with message', aliases: ['/gc'] },
  { command: '/clear', description: 'Clear screen', aliases: ['/cl'] },
  { command: '/exit', description: 'Exit HyperCode', aliases: ['/quit', '/q'] }
];

export class CommandAutocomplete {
  private rl: readline.Interface;
  private isActive: boolean = false;
  private filteredCommands: Command[] = [];
  private selectedIndex: number = 0;
  private currentInput: string = '';
  private originalLine: string = '';
  private cursorPosition: number = 0;
  private suggestionBox: string[] = [];

  constructor(rl: readline.Interface) {
    this.rl = rl;
    this.setupKeyListeners();
  }

  private setupKeyListeners(): void {
    const input = (this.rl as any).input;
    
    input.on('keypress', (str: any, key: any) => {
      if (!key) return;

      // Handle escape key
      if (key.name === 'escape') {
        if (this.isActive) {
          this.hideSuggestions();
          return;
        }
      }

      // Only activate on slash at the beginning of a line
      const currentLine = (this.rl as any).line || '';
      if (str === '/' && !this.isActive && currentLine.length === 0) {
        this.showSuggestions('');
        return;
      }

      // Handle autocomplete navigation when active
      if (this.isActive) {
        switch (key.name) {
          case 'up':
            this.navigateUp();
            return;
          case 'down':
            this.navigateDown();
            return;
          case 'return':
            this.selectCommand();
            return;
          case 'backspace':
            this.handleBackspace();
            return;
          default:
            if (str && str.length === 1) {
              this.handleCharacterInput(str);
              return;
            }
        }
      }
    });
  }

  private showSuggestions(input: string): void {
    this.isActive = true;
    this.currentInput = input;
    this.selectedIndex = 0;
    
    // Filter commands based on input
    this.filteredCommands = AVAILABLE_COMMANDS.filter(cmd => {
      const searchTerm = '/' + input.toLowerCase();
      return cmd.command.toLowerCase().startsWith(searchTerm) ||
             (cmd.aliases && cmd.aliases.some(alias => alias.toLowerCase().startsWith(searchTerm)));
    });

    this.renderSuggestions();
  }

  private hideSuggestions(): void {
    if (!this.isActive) return;
    
    this.isActive = false;
    this.clearSuggestionBox();
    
    // Clear the current input and start fresh
    console.log(chalk.dim('Autocomplete cancelled.'));
  }

  private navigateUp(): void {
    if (this.filteredCommands.length === 0) return;
    
    this.selectedIndex = this.selectedIndex > 0 
      ? this.selectedIndex - 1 
      : this.filteredCommands.length - 1;
    
    this.renderSuggestions();
  }

  private navigateDown(): void {
    if (this.filteredCommands.length === 0) return;
    
    this.selectedIndex = this.selectedIndex < this.filteredCommands.length - 1 
      ? this.selectedIndex + 1 
      : 0;
    
    this.renderSuggestions();
  }

  private selectCommand(): void {
    if (this.filteredCommands.length === 0) return;
    
    const selectedCommand = this.filteredCommands[this.selectedIndex];
    
    this.clearSuggestionBox();
    this.isActive = false;
    
    // Instead of just showing the selection, actually write it to the readline
    this.rl.write('', { ctrl: true, name: 'u' }); // Clear current line
    this.rl.write(selectedCommand.command + ' ');
  }

  private handleBackspace(): void {
    if (this.currentInput.length === 0) {
      this.hideSuggestions();
      return;
    }
    
    this.currentInput = this.currentInput.slice(0, -1);
    this.showSuggestions(this.currentInput);
  }

  private handleCharacterInput(char: string): void {
    this.currentInput += char;
    this.showSuggestions(this.currentInput);
  }

  private renderSuggestions(): void {
    // Clear previous suggestions first
    this.clearSuggestionBox();
    
    if (this.filteredCommands.length === 0) {
      this.suggestionBox = ['No matching commands found. ESC to cancel.'];
      console.log(chalk.red(this.suggestionBox[0]));
      return;
    }
    
    // Build the suggestion lines
    const lines = [];
    lines.push('Available commands:');
    
    const displayCommands = this.filteredCommands.slice(0, 5);
    
    for (let i = 0; i < displayCommands.length; i++) {
      const cmd = displayCommands[i];
      const isSelected = i === this.selectedIndex;
      const prefix = isSelected ? '► ' : '  ';
      const line = `${prefix}${cmd.command} - ${cmd.description}`;
      lines.push(line);
    }
    
    if (this.filteredCommands.length > 5) {
      lines.push(`  ... and ${this.filteredCommands.length - 5} more`);
    }
    
    lines.push('↑↓ Navigate  ⏎ Select  ESC Cancel');
    
    // Store the suggestion box for clearing later
    this.suggestionBox = lines;
    
    // Print the suggestions
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i === 0) {
        console.log(chalk.cyan(line));
      } else if (line.startsWith('►')) {
        console.log(chalk.cyan.bold(line));
      } else if (line.startsWith('↑↓')) {
        console.log(chalk.dim(line));
      } else {
        console.log(chalk.dim(line));
      }
    }
  }

  private buildSuggestionBox(): string[] {
    const maxWidth = 41; // Box width including borders
    const lines: string[] = [];
    
    // Top border
    lines.push(chalk.cyan('┌─────────────────────────────────────┐'));
    
    // Commands (show max 6)
    const displayCommands = this.filteredCommands.slice(0, 6);
    
    for (let i = 0; i < displayCommands.length; i++) {
      const cmd = displayCommands[i];
      const isSelected = i === this.selectedIndex;
      
      let line = `│ ${cmd.command.padEnd(12)} ${cmd.description}`;
      
      // Truncate if too long
      if (line.length > maxWidth - 1) {
        line = line.substring(0, maxWidth - 4) + '...';
      }
      
      // Pad to box width
      line = line.padEnd(maxWidth - 1) + '│';
      
      if (isSelected) {
        lines.push(chalk.cyan.inverse(line));
      } else {
        lines.push(chalk.cyan(line));
      }
    }
    
    if (this.filteredCommands.length > 6) {
      const remaining = this.filteredCommands.length - 6;
      lines.push(chalk.cyan(`│ ... and ${remaining} more`.padEnd(maxWidth - 1) + '│'));
    }
    
    // Separator and help
    lines.push(chalk.cyan('├─────────────────────────────────────┤'));
    lines.push(chalk.cyan('│ ↑↓ Navigate  ⏎ Select  ESC Cancel   │'));
    
    // Bottom border
    lines.push(chalk.cyan('└─────────────────────────────────────┘'));
    
    return lines;
  }

  private clearSuggestionBox(): void {
    if (this.suggestionBox.length === 0) return;
    
    // Move cursor up to the start of the suggestion box and clear each line
    const numLines = this.suggestionBox.length;
    
    // Move cursor up to start of suggestion box
    process.stdout.write(`\x1b[${numLines}A`);
    
    // Clear each line
    for (let i = 0; i < numLines; i++) {
      process.stdout.write('\x1b[2K'); // Clear entire line
      if (i < numLines - 1) {
        process.stdout.write('\x1b[1B'); // Move down one line
      }
    }
    
    // Move cursor back up to start position
    process.stdout.write(`\x1b[${numLines - 1}A`);
    
    this.suggestionBox = [];
  }

  processCommand(input: string): { command: string; args: string } | null {
    if (!input.startsWith('/')) {
      return null;
    }

    const [command, ...args] = input.split(' ');
    const normalizedCommand = command.toLowerCase();
    
    // Find matching command
    const matchedCommand = AVAILABLE_COMMANDS.find(cmd => 
      cmd.command.toLowerCase() === normalizedCommand ||
      (cmd.aliases && cmd.aliases.some(alias => alias.toLowerCase() === normalizedCommand))
    );

    if (matchedCommand) {
      return {
        command: matchedCommand.command.substring(1), // Remove leading slash
        args: args.join(' ')
      };
    }

    return null;
  }

  destroy(): void {
    // Clean up any remaining suggestion box
    this.hideSuggestions();
  }
}