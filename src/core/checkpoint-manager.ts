import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import { TodoManager, TodoGroup } from './todo-manager';

export interface Checkpoint {
  id: string;
  sessionId: string;
  timestamp: Date;
  title: string;
  description?: string;
  todoGroups: TodoGroup[];
  projectState: {
    workingDirectory: string;
    lastCommand?: string;
    contextFiles?: string[];
  };
  conversationContext?: string;
}

export class CheckpointManager {
  private projectRoot: string;
  private checkpointPath: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
    this.checkpointPath = path.join(projectRoot, '.hypercode', 'checkpoints');
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.checkpointPath);
  }

  async createCheckpoint(
    sessionId: string,
    title: string,
    todoManager: TodoManager,
    options: {
      description?: string;
      projectState?: any;
      conversationContext?: string;
    } = {}
  ): Promise<string> {
    const checkpoint: Checkpoint = {
      id: this.generateCheckpointId(),
      sessionId,
      timestamp: new Date(),
      title,
      description: options.description,
      todoGroups: [], // We'll need to get this from TodoManager
      projectState: {
        workingDirectory: process.cwd(),
        lastCommand: options.projectState?.lastCommand,
        contextFiles: options.projectState?.contextFiles || []
      },
      conversationContext: options.conversationContext
    };

    const checkpointFile = path.join(this.checkpointPath, `${checkpoint.id}.json`);
    await fs.writeJSON(checkpointFile, checkpoint, { spaces: 2 });

    console.log(chalk.green(`💾 Checkpoint created: ${title}`));
    console.log(chalk.dim(`   ID: ${checkpoint.id}`));
    console.log(chalk.dim(`   Saved to: ${checkpointFile}`));

    return checkpoint.id;
  }

  async loadCheckpoint(checkpointId: string): Promise<Checkpoint | null> {
    try {
      const checkpointFile = path.join(this.checkpointPath, `${checkpointId}.json`);
      
      if (!(await fs.pathExists(checkpointFile))) {
        return null;
      }

      const checkpoint = await fs.readJSON(checkpointFile);
      
      // Convert string dates back to Date objects
      checkpoint.timestamp = new Date(checkpoint.timestamp);
      
      return checkpoint;
    } catch (error) {
      console.warn(chalk.yellow(`Warning: Could not load checkpoint ${checkpointId}`), error);
      return null;
    }
  }

  async listCheckpoints(sessionId?: string): Promise<Checkpoint[]> {
    try {
      const files = await fs.readdir(this.checkpointPath);
      const checkpointFiles = files.filter(f => f.endsWith('.json'));
      
      const checkpoints: Checkpoint[] = [];
      
      for (const file of checkpointFiles) {
        try {
          const checkpoint = await fs.readJSON(path.join(this.checkpointPath, file));
          checkpoint.timestamp = new Date(checkpoint.timestamp);
          
          if (!sessionId || checkpoint.sessionId === sessionId) {
            checkpoints.push(checkpoint);
          }
        } catch (error) {
          // Skip invalid checkpoint files
          continue;
        }
      }

      // Sort by timestamp (newest first)
      return checkpoints.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not list checkpoints'), error);
      return [];
    }
  }

  async getLatestCheckpoint(sessionId?: string): Promise<Checkpoint | null> {
    const checkpoints = await this.listCheckpoints(sessionId);
    return checkpoints.length > 0 ? checkpoints[0] : null;
  }

  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    try {
      const checkpointFile = path.join(this.checkpointPath, `${checkpointId}.json`);
      
      if (await fs.pathExists(checkpointFile)) {
        await fs.remove(checkpointFile);
        console.log(chalk.green(`🗑️  Deleted checkpoint: ${checkpointId}`));
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(chalk.red(`Failed to delete checkpoint ${checkpointId}:`), error);
      return false;
    }
  }

  async cleanupOldCheckpoints(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<number> {
    try {
      const checkpoints = await this.listCheckpoints();
      const now = Date.now();
      let deletedCount = 0;

      for (const checkpoint of checkpoints) {
        if (now - checkpoint.timestamp.getTime() > maxAge) {
          if (await this.deleteCheckpoint(checkpoint.id)) {
            deletedCount++;
          }
        }
      }

      if (deletedCount > 0) {
        console.log(chalk.blue(`🧹 Cleaned up ${deletedCount} old checkpoints`));
      }

      return deletedCount;
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not cleanup old checkpoints'), error);
      return 0;
    }
  }

  formatCheckpointList(checkpoints: Checkpoint[]): string {
    if (checkpoints.length === 0) {
      return chalk.dim('No checkpoints found.');
    }

    let output = chalk.blue('\n📚 Available Checkpoints:\n');
    
    for (const checkpoint of checkpoints) {
      const timeAgo = this.formatTimeAgo(checkpoint.timestamp);
      output += `\n${chalk.cyan(checkpoint.id.substr(0, 8))} - ${chalk.white(checkpoint.title)}\n`;
      output += `   ${chalk.dim(timeAgo)}`;
      
      if (checkpoint.description) {
        output += ` - ${chalk.dim(checkpoint.description)}`;
      }
      output += '\n';
    }

    return output;
  }

  private generateCheckpointId(): string {
    return `checkpoint_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
  }

  private formatTimeAgo(timestamp: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - timestamp.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) {
      return 'just now';
    } else if (diffMins < 60) {
      return `${diffMins} minute${diffMins === 1 ? '' : 's'} ago`;
    } else if (diffHours < 24) {
      return `${diffHours} hour${diffHours === 1 ? '' : 's'} ago`;
    } else {
      return `${diffDays} day${diffDays === 1 ? '' : 's'} ago`;
    }
  }
}