import * as readline from 'readline';
import chalk from 'chalk';
import { FileOperation } from '../core/file-generator';

export interface ApprovalOptions {
  showPreview: boolean;
  showDiff: boolean;
  autoMode: boolean;
}

export class ApprovalManager {
  private rl: readline.Interface;
  private autoMode: boolean = false;
  private options: ApprovalOptions;

  constructor(rl: readline.Interface) {
    this.rl = rl;
    this.options = {
      showPreview: true,
      showDiff: true,
      autoMode: false
    };
  }

  setAutoMode(enabled: boolean): void {
    this.autoMode = enabled;
  }

  isAutoMode(): boolean {
    return this.autoMode;
  }

  toggleAutoMode(): boolean {
    this.autoMode = !this.autoMode;
    return this.autoMode;
  }

  async requestApproval(
    operation: FileOperation,
    stepNumber: number,
    totalSteps: number
  ): Promise<'approve' | 'edit' | 'skip' | 'auto'> {
    if (this.autoMode) {
      this.showAutoModeOperation(operation, stepNumber, totalSteps);
      return 'approve';
    }

    return this.showInteractiveApproval(operation, stepNumber, totalSteps);
  }

  private showAutoModeOperation(
    operation: FileOperation,
    stepNumber: number,
    totalSteps: number
  ): void {
    const icon = this.getOperationIcon(operation.type);
    const progress = chalk.dim(`[${stepNumber}/${totalSteps}]`);
    const autoIndicator = chalk.yellow('[AUTO]');
    
    console.log(`${progress} ${autoIndicator} ${icon} ${operation.description}...`);
  }

  private async showInteractiveApproval(
    operation: FileOperation,
    stepNumber: number,
    totalSteps: number
  ): Promise<'approve' | 'edit' | 'skip' | 'auto'> {
    const icon = this.getOperationIcon(operation.type);
    const progress = chalk.cyan(`⚡ Step ${stepNumber}/${totalSteps}:`);
    
    console.log(`\n${progress} ${operation.description}...`);
    
    if (this.options.showPreview) {
      this.showFilePreview(operation);
    }

    const prompt = this.buildPromptText(operation);
    
    while (true) {
      const response = await this.askQuestion(prompt);
      const action = this.parseResponse(response.toLowerCase().trim());
      
      if (action) {
        if (action === 'auto') {
          this.autoMode = true;
          console.log(chalk.yellow('\n🚄 Auto-mode enabled - generating remaining files...'));
        }
        return action;
      }
      
      console.log(chalk.red('Invalid response. Please enter y/n/e/s/a or use the full words.'));
    }
  }

  private getOperationIcon(type: string): string {
    switch (type) {
      case 'create': return '📁';
      case 'modify': return '📄';
      case 'delete': return '🗑️';
      default: return '📋';
    }
  }

  private showFilePreview(operation: FileOperation): void {
    const lines = operation.content.split('\n');
    const previewLines = Math.min(8, lines.length);
    const hasMore = lines.length > previewLines;

    console.log('\n' + chalk.cyan(`┌─ ${operation.path} (${operation.type.toUpperCase()}) ─────────────────────────`));
    
    for (let i = 0; i < previewLines; i++) {
      const line = lines[i];
      const lineNum = (i + 1).toString().padStart(2);
      const prefix = operation.type === 'create' ? '+' : operation.type === 'modify' ? '~' : '-';
      const color = operation.type === 'create' ? chalk.green : operation.type === 'modify' ? chalk.yellow : chalk.red;
      
      console.log(color(`│ ${prefix}${lineNum} ${line.substring(0, 65)}`));
    }
    
    if (hasMore) {
      console.log(chalk.cyan(`│ ... and ${lines.length - previewLines} more lines`));
    }
    
    console.log(chalk.cyan('└──────────────────────────────────────────────────────'));
  }

  private buildPromptText(operation: FileOperation): string {
    const basePrompt = `\n${this.getActionText(operation.type)} this file?`;
    const options = [
      chalk.green('(y)es'),
      chalk.red('(n)o/skip'),
      chalk.yellow('(e)dit'),
      chalk.blue('(a)uto-mode')
    ];
    
    if (operation.type === 'modify') {
      options.splice(2, 0, chalk.cyan('(d)iff'));
    }
    
    return `${basePrompt} ${options.join('/')} `;
  }

  private getActionText(type: string): string {
    switch (type) {
      case 'create': return 'Create';
      case 'modify': return 'Modify';
      case 'delete': return 'Delete';
      default: return 'Process';
    }
  }

  private parseResponse(response: string): 'approve' | 'edit' | 'skip' | 'auto' | null {
    const responseMap: Record<string, 'approve' | 'edit' | 'skip' | 'auto'> = {
      'y': 'approve',
      'yes': 'approve',
      'n': 'skip',
      'no': 'skip',
      's': 'skip',
      'skip': 'skip',
      'e': 'edit',
      'edit': 'edit',
      'a': 'auto',
      'auto': 'auto',
      'auto-mode': 'auto'
    };

    return responseMap[response] || null;
  }

  askQuestion(prompt: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        resolve(answer);
      });
    });
  }

  async showDiff(operation: FileOperation): Promise<void> {
    if (operation.type === 'create') {
      console.log(chalk.green('\n📋 New file content:'));
      this.showFilePreview(operation);
    } else if (operation.type === 'modify' && operation.backup) {
      console.log(chalk.blue('\n📊 Changes to be made:'));
      this.showModifyDiff(operation);
    } else {
      console.log(chalk.yellow('\nNo diff available for this operation.'));
    }
  }

  private showModifyDiff(operation: FileOperation): void {
    if (!operation.backup) return;

    const oldLines = operation.backup.split('\n');
    const newLines = operation.content.split('\n');
    
    console.log(chalk.blue(`--- ${operation.path} (original)`));
    console.log(chalk.blue(`+++ ${operation.path} (modified)`));
    
    const maxLines = Math.max(oldLines.length, newLines.length);
    let contextStart = 0;
    let contextEnd = Math.min(10, maxLines); // Show first 10 lines of diff
    
    for (let i = contextStart; i < contextEnd; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      const lineNum = (i + 1).toString().padStart(3);
      
      if (oldLine === undefined) {
        console.log(chalk.green(`+${lineNum} ${newLine}`));
      } else if (newLine === undefined) {
        console.log(chalk.red(`-${lineNum} ${oldLine}`));
      } else if (oldLine !== newLine) {
        console.log(chalk.red(`-${lineNum} ${oldLine}`));
        console.log(chalk.green(`+${lineNum} ${newLine}`));
      } else {
        console.log(chalk.dim(` ${lineNum} ${oldLine}`));
      }
    }
    
    if (maxLines > contextEnd) {
      console.log(chalk.dim(`... and ${maxLines - contextEnd} more lines`));
    }
  }

  showGenerationPlan(files: FileOperation[], feature: string): void {
    console.log(`\n${chalk.green('🤖')} I'll create a complete ${feature}. Here's my plan:\n`);
    console.log(chalk.blue('📋 Files to Create/Modify:'));
    
    for (const file of files) {
      const icon = this.getOperationIcon(file.type);
      const status = file.type === 'create' ? chalk.green('(new)') : chalk.yellow('(modify)');
      console.log(`  ${icon} ${file.path} ${status}`);
    }
  }

  showGenerationSummary(
    files: FileOperation[],
    estimatedCost: number,
    gitStrategy: string,
    branchName?: string
  ): void {
    console.log(`\n${chalk.yellow('💰')} Estimated cost: ${chalk.green(`$${estimatedCost.toFixed(4)}`)}`);
    
    if (gitStrategy === 'new-branch' && branchName) {
      console.log(`${chalk.blue('🌿')} Git strategy: Create feature branch '${branchName}'`);
    } else {
      console.log(`${chalk.blue('🌿')} Git strategy: Work in current branch`);
    }
  }

  async confirmGeneration(): Promise<boolean> {
    const response = await this.askQuestion('\nContinue with generation? (y/n/preview): ');
    const normalized = response.toLowerCase().trim();
    
    if (normalized === 'preview' || normalized === 'p') {
      // TODO: Implement preview mode
      console.log(chalk.yellow('Preview mode not yet implemented.'));
      return this.confirmGeneration();
    }
    
    return normalized === 'y' || normalized === 'yes';
  }

  showControlsHelp(): void {
    console.log('\n' + chalk.blue('📖 Interactive Controls:'));
    console.log('  • ' + chalk.green('y/yes') + ' - Approve this file');
    console.log('  • ' + chalk.red('n/no/skip') + ' - Skip this file');  
    console.log('  • ' + chalk.yellow('e/edit') + ' - Edit before creating');
    console.log('  • ' + chalk.cyan('d/diff') + ' - Show detailed diff (modify only)');
    console.log('  • ' + chalk.blue('a/auto') + ' - Enable auto-mode for remaining files');
    console.log('\n' + chalk.dim('💡 Tip: Use Shift+Tab to toggle auto-mode at any time'));
    console.log(chalk.dim('💡 Todo tracking: Use /todo and /continue in interactive mode'));
  }

  showAutoModeStatus(): void {
    if (this.autoMode) {
      console.log(chalk.yellow('\n🚄 AUTO-MODE ENABLED') + chalk.dim(' - All remaining files will be processed automatically'));
      console.log(chalk.dim('Press Shift+Tab to return to step-by-step mode'));
    }
  }

  displayCompletionSummary(
    filesCreated: string[],
    filesModified: string[],
    filesSkipped: string[],
    errors: string[]
  ): void {
    console.log('\n' + chalk.green('✅ Generation Complete!\n'));
    console.log(chalk.dim('💡 Remember: Use /todo to track progress, /continue to resume tasks'));
    
    if (filesCreated.length > 0) {
      console.log(chalk.green('📁 Created Files:'));
      filesCreated.forEach(file => console.log(`  ✓ ${file}`));
      console.log();
    }
    
    if (filesModified.length > 0) {
      console.log(chalk.yellow('📄 Modified Files:'));
      filesModified.forEach(file => console.log(`  ✓ ${file}`));
      console.log();
    }
    
    if (filesSkipped.length > 0) {
      console.log(chalk.blue('⏭️  Skipped Files:'));
      filesSkipped.forEach(file => console.log(`  - ${file}`));
      console.log();
    }
    
    if (errors.length > 0) {
      console.log(chalk.red('❌ Errors:'));
      errors.forEach(error => console.log(`  × ${error}`));
      console.log();
    }
  }
}