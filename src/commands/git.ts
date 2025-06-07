import chalk from 'chalk';
import inquirer from 'inquirer';
import { GitManager, GitConfig } from '../core/git-manager';
import { DirectorySafety } from '../core/directory-safety';

export async function gitStatusCommand(): Promise<void> {
  try {
    const directorySafety = new DirectorySafety();
    const gitManager = new GitManager(directorySafety.getProjectRoot());
    await gitManager.initialize();

    console.log(chalk.green('🔧 Git Integration Status\\n'));
    
    // Show git repository status
    const statusDisplay = await gitManager.getGitStatusDisplay();
    console.log(statusDisplay);
    
    // Show HyperCode git configuration
    const config = gitManager.getConfig();
    console.log('\\n' + chalk.blue('⚙️  HyperCode Git Configuration:'));
    console.log(`  Auto-commit: ${config.autoCommit ? chalk.green('✅ Enabled') : chalk.red('❌ Disabled')}`);
    console.log(`  Feature branches: ${config.createFeatureBranches ? chalk.green('✅ Enabled') : chalk.red('❌ Disabled')}`);
    console.log(`  Auto-push: ${config.autoPush ? chalk.green('✅ Enabled') : chalk.red('❌ Disabled')}`);
    console.log(`  Commit prefix: ${chalk.cyan(config.commitMessagePrefix)}`);
    console.log(`  Branch prefix: ${chalk.cyan(config.branchPrefix)}`);
    
    console.log('\\n' + chalk.dim('Use /git-setup to configure these settings.'));
    
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  }
}

export async function gitSetupCommand(): Promise<void> {
  try {
    const directorySafety = new DirectorySafety();
    const gitManager = new GitManager(directorySafety.getProjectRoot());
    await gitManager.initialize();

    const gitStatus = await gitManager.getStatus();
    
    if (!gitStatus.isGitRepo) {
      console.log(chalk.red('❌ Not a git repository. Initialize git first:'));
      console.log(chalk.cyan('git init'));
      return;
    }

    console.log(chalk.green('🔧 Git Integration Setup\\n'));
    console.log(chalk.blue('Current git status:'), chalk.green('✅ Git repository detected'));
    console.log(chalk.blue('Current branch:'), chalk.cyan(gitStatus.currentBranch));
    
    if (gitStatus.hasRemote) {
      console.log(chalk.blue('Remote:'), chalk.cyan(`${gitStatus.remoteName} (${gitStatus.remoteUrl})`));
    } else {
      console.log(chalk.yellow('⚠️  No remote configured'));
    }

    const currentConfig = gitManager.getConfig();
    
    const answers = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'autoCommit',
        message: 'Auto-commit after file generation?',
        default: currentConfig.autoCommit
      },
      {
        type: 'confirm',
        name: 'createFeatureBranches',
        message: 'Create feature branches for new features?',
        default: currentConfig.createFeatureBranches
      },
      {
        type: 'confirm',
        name: 'autoPush',
        message: 'Auto-push commits to remote?',
        default: currentConfig.autoPush,
        when: (answers) => gitStatus.hasRemote
      },
      {
        type: 'input',
        name: 'commitMessagePrefix',
        message: 'Commit message prefix:',
        default: currentConfig.commitMessagePrefix
      },
      {
        type: 'input',
        name: 'branchPrefix',
        message: 'Feature branch prefix:',
        default: currentConfig.branchPrefix,
        when: (answers) => answers.createFeatureBranches
      }
    ]);

    // Update configuration
    const newConfig: Partial<GitConfig> = {
      autoCommit: answers.autoCommit,
      createFeatureBranches: answers.createFeatureBranches,
      autoPush: answers.autoPush || false,
      commitMessagePrefix: answers.commitMessagePrefix,
      branchPrefix: answers.branchPrefix || currentConfig.branchPrefix
    };

    await gitManager.updateConfig(newConfig);
    
    console.log('\\n' + chalk.green('✅ Git integration configured successfully!'));
    console.log('\\n' + chalk.blue('Summary:'));
    console.log(`  Auto-commit: ${newConfig.autoCommit ? chalk.green('✅') : chalk.red('❌')}`);
    console.log(`  Feature branches: ${newConfig.createFeatureBranches ? chalk.green('✅') : chalk.red('❌')}`);
    console.log(`  Auto-push: ${newConfig.autoPush ? chalk.green('✅') : chalk.red('❌')}`);
    console.log(`  Commit prefix: ${chalk.cyan(newConfig.commitMessagePrefix)}`);
    if (newConfig.createFeatureBranches) {
      console.log(`  Branch prefix: ${chalk.cyan(newConfig.branchPrefix)}`);
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
  }
}

export async function gitPushCommand(): Promise<void> {
  try {
    const directorySafety = new DirectorySafety();
    const gitManager = new GitManager(directorySafety.getProjectRoot());
    await gitManager.initialize();

    const gitStatus = await gitManager.getStatus();
    
    if (!gitStatus.isGitRepo) {
      console.log(chalk.red('❌ Not a git repository'));
      return;
    }

    if (!gitStatus.hasRemote) {
      console.log(chalk.red('❌ No remote repository configured'));
      console.log(chalk.blue('Add a remote first:'));
      console.log(chalk.cyan('git remote add origin <repository-url>'));
      return;
    }

    if (!gitStatus.hasUncommittedChanges && gitStatus.ahead === 0) {
      console.log(chalk.green('✅ Nothing to push - everything up to date'));
      return;
    }

    if (gitStatus.hasUncommittedChanges) {
      console.log(chalk.yellow('⚠️  You have uncommitted changes'));
      const { shouldCommit } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'shouldCommit',
          message: 'Commit changes before pushing?',
          default: true
        }
      ]);

      if (shouldCommit) {
        const { commitMessage } = await inquirer.prompt([
          {
            type: 'input',
            name: 'commitMessage',
            message: 'Commit message:',
            default: 'Update files'
          }
        ]);

        await gitManager.commit(commitMessage);
        console.log(chalk.green('✅ Changes committed'));
      } else {
        console.log(chalk.yellow('Push cancelled - commit your changes first'));
        return;
      }
    }

    console.log(chalk.blue('🚀 Pushing to remote...'));
    await gitManager.push();
    console.log(chalk.green('✅ Successfully pushed to remote!'));
    
  } catch (error) {
    console.error(chalk.red('Push failed:'), error instanceof Error ? error.message : String(error));
  }
}

export async function gitBranchCommand(branchName?: string): Promise<void> {
  try {
    const directorySafety = new DirectorySafety();
    const gitManager = new GitManager(directorySafety.getProjectRoot());
    await gitManager.initialize();

    const gitStatus = await gitManager.getStatus();
    
    if (!gitStatus.isGitRepo) {
      console.log(chalk.red('❌ Not a git repository'));
      return;
    }

    if (!branchName) {
      const { name } = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Branch name:',
          validate: (input) => input.trim().length > 0 || 'Branch name is required'
        }
      ]);
      branchName = name;
    }

    console.log(chalk.blue(`🌿 Creating branch: ${branchName}...`));
    const fullBranchName = await gitManager.createBranch(branchName!);
    console.log(chalk.green(`✅ Created and switched to branch: ${fullBranchName}`));
    
  } catch (error) {
    console.error(chalk.red('Branch creation failed:'), error instanceof Error ? error.message : String(error));
  }
}

export async function gitCommitCommand(message?: string): Promise<void> {
  try {
    const directorySafety = new DirectorySafety();
    const gitManager = new GitManager(directorySafety.getProjectRoot());
    await gitManager.initialize();

    const gitStatus = await gitManager.getStatus();
    
    if (!gitStatus.isGitRepo) {
      console.log(chalk.red('❌ Not a git repository'));
      return;
    }

    if (!gitStatus.hasUncommittedChanges) {
      console.log(chalk.green('✅ Nothing to commit - working directory clean'));
      return;
    }

    if (!message) {
      const { commitMessage } = await inquirer.prompt([
        {
          type: 'input',
          name: 'commitMessage',
          message: 'Commit message:',
          validate: (input) => input.trim().length > 0 || 'Commit message is required'
        }
      ]);
      message = commitMessage;
    }

    console.log(chalk.blue('📝 Committing changes...'));
    await gitManager.commit(message!);
    console.log(chalk.green('✅ Changes committed successfully!'));
    
    const config = gitManager.getConfig();
    if (config.autoPush && gitStatus.hasRemote) {
      console.log(chalk.blue('🚀 Auto-pushing to remote...'));
      try {
        await gitManager.push();
        console.log(chalk.green('✅ Pushed to remote!'));
      } catch (error) {
        console.log(chalk.yellow(`⚠️  Push failed: ${error}. Use /git-push to retry.`));
      }
    }
    
  } catch (error) {
    console.error(chalk.red('Commit failed:'), error instanceof Error ? error.message : String(error));
  }
}

export async function gitCommand(subcommand?: string, ...args: string[]): Promise<void> {
  if (!subcommand) {
    console.log(chalk.blue('🔧 HyperCode Git Integration\\n'));
    console.log('Available git commands:');
    console.log('  /git-status  - Show git and HyperCode status');
    console.log('  /git-setup   - Configure git integration');
    console.log('  /git-push    - Push changes to remote');
    console.log('  /git-branch  - Create new branch');
    console.log('  /git-commit  - Manual commit with message');
    return;
  }

  switch (subcommand) {
    case 'status':
      await gitStatusCommand();
      break;
    case 'setup':
      await gitSetupCommand();
      break;
    case 'push':
      await gitPushCommand();
      break;
    case 'branch':
      await gitBranchCommand(args[0]);
      break;
    case 'commit':
      await gitCommitCommand(args.join(' '));
      break;
    default:
      console.log(chalk.red(`Unknown git subcommand: ${subcommand}`));
      await gitCommand(); // Show help
  }
}