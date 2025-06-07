import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';

export interface GitConfig {
  autoCommit: boolean;
  createFeatureBranches: boolean;
  autoPush: boolean;
  commitMessagePrefix: string;
  branchPrefix: string;
}

export interface GitStatus {
  isGitRepo: boolean;
  currentBranch: string;
  hasRemote: boolean;
  remoteName?: string;
  remoteUrl?: string;
  hasUncommittedChanges: boolean;
  ahead: number;
  behind: number;
}

export class GitManager {
  private projectRoot: string;
  private configPath: string;
  private config: GitConfig;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.configPath = path.join(projectRoot, '.hypercode', 'git-config.json');
    this.config = this.getDefaultConfig();
  }

  private getDefaultConfig(): GitConfig {
    return {
      autoCommit: false,
      createFeatureBranches: true,
      autoPush: false,
      commitMessagePrefix: '[HyperCode]',
      branchPrefix: 'hypercode-'
    };
  }

  async initialize(): Promise<void> {
    await this.loadConfig();
  }

  private async loadConfig(): Promise<void> {
    try {
      if (await fs.pathExists(this.configPath)) {
        const savedConfig = await fs.readJson(this.configPath);
        this.config = { ...this.config, ...savedConfig };
      }
    } catch (error) {
      console.warn('Failed to load git config, using defaults:', error);
    }
  }

  async saveConfig(): Promise<void> {
    try {
      await fs.ensureFile(this.configPath);
      await fs.writeJson(this.configPath, this.config, { spaces: 2 });
    } catch (error) {
      console.warn('Failed to save git config:', error);
    }
  }

  getConfig(): GitConfig {
    return { ...this.config };
  }

  async updateConfig(updates: Partial<GitConfig>): Promise<void> {
    this.config = { ...this.config, ...updates };
    await this.saveConfig();
  }

  async isGitRepository(): Promise<boolean> {
    try {
      const result = await this.runGitCommand(['rev-parse', '--git-dir']);
      return result.success;
    } catch (error) {
      return false;
    }
  }

  async getStatus(): Promise<GitStatus> {
    const isGitRepo = await this.isGitRepository();
    
    if (!isGitRepo) {
      return {
        isGitRepo: false,
        currentBranch: '',
        hasRemote: false,
        hasUncommittedChanges: false,
        ahead: 0,
        behind: 0
      };
    }

    const [
      currentBranch,
      remoteInfo,
      statusResult,
      trackingInfo
    ] = await Promise.all([
      this.getCurrentBranch(),
      this.getRemoteInfo(),
      this.runGitCommand(['status', '--porcelain']),
      this.getTrackingInfo()
    ]);

    return {
      isGitRepo: true,
      currentBranch,
      hasRemote: remoteInfo.hasRemote,
      remoteName: remoteInfo.remoteName,
      remoteUrl: remoteInfo.remoteUrl,
      hasUncommittedChanges: statusResult.stdout.trim().length > 0,
      ahead: trackingInfo.ahead,
      behind: trackingInfo.behind
    };
  }

  async getCurrentBranch(): Promise<string> {
    try {
      const result = await this.runGitCommand(['branch', '--show-current']);
      return result.stdout.trim() || 'HEAD';
    } catch (error) {
      return 'unknown';
    }
  }

  private async getRemoteInfo(): Promise<{ hasRemote: boolean; remoteName?: string; remoteUrl?: string }> {
    try {
      const result = await this.runGitCommand(['remote', '-v']);
      if (!result.success || !result.stdout.trim()) {
        return { hasRemote: false };
      }

      const lines = result.stdout.trim().split('\\n');
      const firstRemote = lines[0];
      const [remoteName, remoteUrl] = firstRemote.split('\\t');
      
      return {
        hasRemote: true,
        remoteName: remoteName.trim(),
        remoteUrl: remoteUrl.split(' ')[0] // Remove (fetch/push) suffix
      };
    } catch (error) {
      return { hasRemote: false };
    }
  }

  private async getTrackingInfo(): Promise<{ ahead: number; behind: number }> {
    try {
      const result = await this.runGitCommand(['status', '--porcelain=v1', '--branch']);
      const lines = result.stdout.split('\\n');
      const branchLine = lines.find(line => line.startsWith('##'));
      
      if (!branchLine) {
        return { ahead: 0, behind: 0 };
      }

      // Parse ahead/behind from: ## main...origin/main [ahead 2, behind 1]
      const match = branchLine.match(/\\[ahead (\\d+), behind (\\d+)\\]|\\[ahead (\\d+)\\]|\\[behind (\\d+)\\]/);
      if (!match) {
        return { ahead: 0, behind: 0 };
      }

      const ahead = parseInt(match[1] || match[3] || '0');
      const behind = parseInt(match[2] || match[4] || '0');
      
      return { ahead, behind };
    } catch (error) {
      return { ahead: 0, behind: 0 };
    }
  }

  async createBranch(featureName: string): Promise<string> {
    const branchName = `${this.config.branchPrefix}${featureName}`;
    
    try {
      // Check if branch already exists
      const branchExists = await this.runGitCommand(['show-ref', '--verify', '--quiet', `refs/heads/${branchName}`]);
      
      if (branchExists.success) {
        // Branch exists, checkout to it
        await this.runGitCommand(['checkout', branchName]);
      } else {
        // Create new branch
        await this.runGitCommand(['checkout', '-b', branchName]);
      }
      
      return branchName;
    } catch (error) {
      throw new Error(`Failed to create/switch to branch ${branchName}: ${error}`);
    }
  }

  async createBackup(): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupBranch = `hypercode-backup-${timestamp}`;
    
    try {
      await this.runGitCommand(['branch', backupBranch]);
      return backupBranch;
    } catch (error) {
      throw new Error(`Failed to create backup branch: ${error}`);
    }
  }

  async stageFiles(files: string[]): Promise<void> {
    try {
      for (const file of files) {
        await this.runGitCommand(['add', file]);
      }
    } catch (error) {
      throw new Error(`Failed to stage files: ${error}`);
    }
  }

  async commit(message: string, files?: string[]): Promise<void> {
    try {
      if (files && files.length > 0) {
        await this.stageFiles(files);
      }

      const fullMessage = `${this.config.commitMessagePrefix} ${message}`;
      await this.runGitCommand(['commit', '-m', fullMessage]);
    } catch (error) {
      throw new Error(`Failed to commit: ${error}`);
    }
  }

  async autoCommit(files: string[], feature: string): Promise<void> {
    if (!this.config.autoCommit) {
      return;
    }

    const message = `Add ${feature}`;
    await this.commit(message, files);
  }

  async push(remote?: string, branch?: string): Promise<void> {
    try {
      const args = ['push'];
      
      if (remote && branch) {
        args.push(remote, branch);
      } else if (remote) {
        args.push(remote);
      } else {
        // Use default push behavior
        args.push('--set-upstream', 'origin', await this.getCurrentBranch());
      }

      await this.runGitCommand(args);
    } catch (error) {
      throw new Error(`Failed to push: ${error}`);
    }
  }

  async getDiff(file?: string): Promise<string> {
    try {
      const args = ['diff', '--color=always'];
      if (file) {
        args.push(file);
      }
      
      const result = await this.runGitCommand(args);
      return result.stdout;
    } catch (error) {
      return '';
    }
  }

  private async runGitCommand(args: string[]): Promise<{ success: boolean; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const process = spawn('git', args, {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        resolve({
          success: code === 0,
          stdout,
          stderr
        });
      });

      process.on('error', (error) => {
        resolve({
          success: false,
          stdout,
          stderr: error.message
        });
      });
    });
  }

  generateCommitMessage(files: string[], feature: string): string {
    const fileTypes = new Set<string>();
    const actions = new Set<string>();
    
    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      fileTypes.add(ext || 'config');
      
      // Determine action based on file existence
      actions.add(fs.existsSync(path.join(this.projectRoot, file)) ? 'modify' : 'create');
    }

    const actionText = actions.has('create') ? 'Add' : 'Update';
    const typeText = fileTypes.size > 1 ? 'components' : Array.from(fileTypes)[0].replace('.', '');
    
    return `${actionText} ${feature} ${typeText}`;
  }

  async getGitStatusDisplay(): Promise<string> {
    const status = await this.getStatus();
    
    if (!status.isGitRepo) {
      return chalk.red('❌ Not a git repository');
    }

    const lines = [
      chalk.green('✅ Git repository detected'),
      chalk.blue(`Current branch: ${status.currentBranch}`)
    ];

    if (status.hasRemote) {
      lines.push(chalk.blue(`Remote: ${status.remoteName} (${status.remoteUrl})`));
      
      if (status.ahead > 0 || status.behind > 0) {
        const tracking = [];
        if (status.ahead > 0) tracking.push(chalk.green(`${status.ahead} ahead`));
        if (status.behind > 0) tracking.push(chalk.red(`${status.behind} behind`));
        lines.push(chalk.yellow(`Status: ${tracking.join(', ')}`));
      }
    } else {
      lines.push(chalk.yellow('Remote: Not configured'));
    }

    if (status.hasUncommittedChanges) {
      lines.push(chalk.yellow('⚠️  Uncommitted changes detected'));
    } else {
      lines.push(chalk.green('✅ Working directory clean'));
    }

    return lines.join('\\n');
  }
}