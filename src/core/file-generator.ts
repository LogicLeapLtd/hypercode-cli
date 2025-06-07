import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { DirectorySafety } from './directory-safety';
import { GitManager } from './git-manager';

export interface FileOperation {
  path: string;
  type: 'create' | 'modify' | 'delete';
  content: string;
  backup?: string;
  description: string;
  estimatedLines: number;
}

export interface FileGenerationPlan {
  feature: string;
  files: FileOperation[];
  estimatedCost: number;
  gitStrategy: 'new-branch' | 'current-branch';
  branchName?: string;
  summary: string;
}

export interface GenerationResult {
  success: boolean;
  filesCreated: string[];
  filesModified: string[];
  filesSkipped: string[];
  errors: string[];
  gitCommit?: string;
  branchCreated?: string;
}

export class FileGenerator {
  private directorySafety: DirectorySafety;
  private gitManager: GitManager;
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.directorySafety = new DirectorySafety();
    this.gitManager = new GitManager(projectRoot);
  }

  async initialize(): Promise<void> {
    await this.gitManager.initialize();
  }

  async createGenerationPlan(
    feature: string, 
    generatedContent: string,
    estimatedCost: number
  ): Promise<FileGenerationPlan> {
    // Parse the generated content to extract file operations
    const files = this.parseGeneratedContent(generatedContent);
    
    // Determine git strategy
    const gitConfig = this.gitManager.getConfig();
    const gitStrategy = gitConfig.createFeatureBranches ? 'new-branch' : 'current-branch';
    
    let branchName: string | undefined;
    if (gitStrategy === 'new-branch') {
      const safeName = this.sanitizeFeatureName(feature);
      branchName = `${gitConfig.branchPrefix}${safeName}`;
    }

    const summary = this.generatePlanSummary(files, feature);

    return {
      feature,
      files,
      estimatedCost,
      gitStrategy,
      branchName,
      summary
    };
  }

  private parseGeneratedContent(content: string): FileOperation[] {
    const files: FileOperation[] = [];
    
    // Look for code blocks with file paths
    const fileRegex = /```(?:typescript|javascript|jsx|tsx|python|go|rust|json|html)?\s*\n(?:\/\/\s*(.+?)\n)?(.*?)```/gs;
    let match;

    while ((match = fileRegex.exec(content)) !== null) {
      const [, pathComment, code] = match;
      
      if (pathComment) {
        const filePath = this.extractFilePath(pathComment);
        if (filePath) {
          const fullPath = path.resolve(this.projectRoot, filePath);
          
          // Validate path is safe
          try {
            this.directorySafety.validatePath(fullPath);
            
            const exists = fs.existsSync(fullPath);
            const operation: FileOperation = {
              path: filePath,
              type: exists ? 'modify' : 'create',
              content: code.trim(),
              description: this.generateFileDescription(filePath, exists),
              estimatedLines: code.split('\n').length
            };

            if (exists) {
              operation.backup = fs.readFileSync(fullPath, 'utf8');
            }

            files.push(operation);
          } catch (error) {
            console.warn(`Skipping unsafe file path: ${filePath}`);
          }
        }
      }
    }

    // Also look for explicit file mentions in the text
    const explicitFileRegex = /(?:Create|Update|Modify)\s+(?:file\s+)?[`"]?([^`"\s]+\.[a-z]{1,4})[`"]?/gi;
    let explicitMatch;

    while ((explicitMatch = explicitFileRegex.exec(content)) !== null) {
      const filePath = explicitMatch[1];
      
      if (!files.some(f => f.path === filePath)) {
        try {
          const fullPath = path.resolve(this.projectRoot, filePath);
          this.directorySafety.validatePath(fullPath);
          
          const exists = fs.existsSync(fullPath);
          files.push({
            path: filePath,
            type: exists ? 'modify' : 'create',
            content: '// TODO: Implementation needed',
            description: this.generateFileDescription(filePath, exists),
            estimatedLines: 10
          });
        } catch (error) {
          console.warn(`Skipping unsafe file path: ${filePath}`);
        }
      }
    }

    return files;
  }

  private extractFilePath(comment: string): string | null {
    // Clean up the comment to extract file path
    const cleaned = comment.replace(/^(\/\/|#|<!--)\s*/, '').trim();
    
    // Look for file path patterns
    const pathPatterns = [
      /^File:\\s*(.+)$/i,
      /^Path:\\s*(.+)$/i,
      /^(.+\\.(?:ts|tsx|js|jsx|py|go|rs|java|cpp|h|css|scss|json|md|yml|yaml))$/i,
      /^(.+)$/
    ];

    for (const pattern of pathPatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        return match[1].trim();
      }
    }

    return null;
  }

  private generateFileDescription(filePath: string, exists: boolean): string {
    const fileName = path.basename(filePath);
    const fileType = this.getFileType(filePath);
    const action = exists ? 'Modify' : 'Create';
    
    return `${action} ${fileType} ${fileName}`;
  }

  private getFileType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const typeMap: Record<string, string> = {
      '.ts': 'TypeScript file',
      '.tsx': 'React component',
      '.js': 'JavaScript file',
      '.jsx': 'React component',
      '.py': 'Python module',
      '.go': 'Go file',
      '.rs': 'Rust file',
      '.java': 'Java class',
      '.cpp': 'C++ file',
      '.h': 'Header file',
      '.css': 'Stylesheet',
      '.scss': 'Sass stylesheet',
      '.json': 'Configuration file',
      '.md': 'Documentation',
      '.yml': 'YAML configuration',
      '.yaml': 'YAML configuration'
    };

    return typeMap[ext] || 'file';
  }

  private sanitizeFeatureName(feature: string): string {
    return feature
      .toLowerCase()
      .replace(/[^a-z0-9\\s-]/g, '')
      .replace(/\\s+/g, '-')
      .replace(/-+/g, '-')
      .substring(0, 50);
  }

  private generatePlanSummary(files: FileOperation[], feature: string): string {
    const createCount = files.filter(f => f.type === 'create').length;
    const modifyCount = files.filter(f => f.type === 'modify').length;
    const totalLines = files.reduce((sum, f) => sum + f.estimatedLines, 0);

    const parts = [];
    if (createCount > 0) parts.push(`${createCount} new file${createCount > 1 ? 's' : ''}`);
    if (modifyCount > 0) parts.push(`${modifyCount} modified file${modifyCount > 1 ? 's' : ''}`);

    return `Generate ${feature}: ${parts.join(', ')} (~${totalLines} lines)`;
  }

  async executeGenerationPlan(
    plan: FileGenerationPlan,
    approvalCallback: (operation: FileOperation) => Promise<'approve' | 'edit' | 'skip' | 'auto'>
  ): Promise<GenerationResult> {
    const result: GenerationResult = {
      success: true,
      filesCreated: [],
      filesModified: [],
      filesSkipped: [],
      errors: []
    };

    // Setup git if needed
    if (plan.gitStrategy === 'new-branch' && plan.branchName) {
      try {
        const gitStatus = await this.gitManager.getStatus();
        if (gitStatus.isGitRepo) {
          await this.gitManager.createBranch(this.sanitizeFeatureName(plan.feature));
          result.branchCreated = plan.branchName;
        }
      } catch (error) {
        result.errors.push(`Git branch creation failed: ${error}`);
      }
    }

    let autoMode = false;

    // Process each file operation
    for (const operation of plan.files) {
      try {
        let approval: 'approve' | 'edit' | 'skip' | 'auto';
        
        if (autoMode) {
          approval = 'approve';
        } else {
          approval = await approvalCallback(operation);
          
          if (approval === 'auto') {
            autoMode = true;
            approval = 'approve';
          }
        }

        switch (approval) {
          case 'approve':
            await this.executeFileOperation(operation);
            if (operation.type === 'create') {
              result.filesCreated.push(operation.path);
            } else if (operation.type === 'modify') {
              result.filesModified.push(operation.path);
            }
            break;
            
          case 'skip':
            result.filesSkipped.push(operation.path);
            break;
            
          case 'edit':
            // TODO: Implement edit mode
            result.filesSkipped.push(operation.path);
            result.errors.push(`Edit mode not yet implemented for ${operation.path}`);
            break;
        }
      } catch (error) {
        result.errors.push(`Failed to process ${operation.path}: ${error}`);
        result.success = false;
      }
    }

    // Auto-commit if configured
    const gitConfig = this.gitManager.getConfig();
    if (gitConfig.autoCommit && (result.filesCreated.length > 0 || result.filesModified.length > 0)) {
      try {
        const allFiles = [...result.filesCreated, ...result.filesModified];
        const message = this.gitManager.generateCommitMessage(allFiles, plan.feature);
        await this.gitManager.commit(message, allFiles);
        result.gitCommit = message;
      } catch (error) {
        result.errors.push(`Auto-commit failed: ${error}`);
      }
    }

    return result;
  }

  private async executeFileOperation(operation: FileOperation): Promise<void> {
    const fullPath = path.resolve(this.projectRoot, operation.path);
    
    // Ensure directory exists
    await fs.ensureDir(path.dirname(fullPath));
    
    switch (operation.type) {
      case 'create':
      case 'modify':
        await fs.writeFile(fullPath, operation.content, 'utf8');
        break;
        
      case 'delete':
        if (await fs.pathExists(fullPath)) {
          await fs.remove(fullPath);
        }
        break;
    }
  }

  displayFileOperation(operation: FileOperation): string {
    const icon = operation.type === 'create' ? '📁' : operation.type === 'modify' ? '📄' : '🗑️';
    const typeText = operation.type.toUpperCase();
    const lines = operation.content.split('\\n');
    const preview = lines.slice(0, 5).join('\\n');
    const hasMore = lines.length > 5;

    const header = chalk.cyan(`┌─ ${operation.path} (${typeText}) ─────────────────────────┐`);
    const content = preview.split('\\n').map(line => 
      chalk.green(`│ + ${line.padEnd(50)} │`)
    ).join('\\n');
    const footer = hasMore 
      ? chalk.cyan(`│ ... and ${lines.length - 5} more lines`.padEnd(53) + '│')
      : '';
    const bottom = chalk.cyan('└──────────────────────────────────────────────────────┘');

    return [header, content, footer, bottom].filter(Boolean).join('\\n');
  }

  async generateDiff(operation: FileOperation): Promise<string> {
    if (operation.type === 'create') {
      return this.generateCreateDiff(operation);
    } else if (operation.type === 'modify' && operation.backup) {
      return this.generateModifyDiff(operation);
    }
    return '';
  }

  private generateCreateDiff(operation: FileOperation): string {
    const lines = operation.content.split('\\n');
    const header = chalk.blue(`+++ ${operation.path} (new file)`);
    const content = lines.map((line, index) => 
      chalk.green(`+${(index + 1).toString().padStart(3)} ${line}`)
    ).join('\\n');
    
    return `${header}\\n${content}`;
  }

  private generateModifyDiff(operation: FileOperation): string {
    if (!operation.backup) return '';
    
    const oldLines = operation.backup.split('\\n');
    const newLines = operation.content.split('\\n');
    
    // Simple diff - this could be enhanced with a proper diff algorithm
    const header = chalk.blue(`--- ${operation.path} (original)\\n+++ ${operation.path} (modified)`);
    const diff = this.simpleDiff(oldLines, newLines);
    
    return `${header}\\n${diff}`;
  }

  private simpleDiff(oldLines: string[], newLines: string[]): string {
    const result: string[] = [];
    const maxLines = Math.max(oldLines.length, newLines.length);
    
    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      
      if (oldLine === undefined) {
        result.push(chalk.green(`+${(i + 1).toString().padStart(3)} ${newLine}`));
      } else if (newLine === undefined) {
        result.push(chalk.red(`-${(i + 1).toString().padStart(3)} ${oldLine}`));
      } else if (oldLine !== newLine) {
        result.push(chalk.red(`-${(i + 1).toString().padStart(3)} ${oldLine}`));
        result.push(chalk.green(`+${(i + 1).toString().padStart(3)} ${newLine}`));
      } else {
        result.push(chalk.dim(` ${(i + 1).toString().padStart(3)} ${oldLine}`));
      }
    }
    
    return result.join('\\n');
  }
}