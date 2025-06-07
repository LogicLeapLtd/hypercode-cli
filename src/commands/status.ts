import chalk from 'chalk';
import * as path from 'path';
import { DirectorySafety } from '../core/directory-safety';
import { ConfigManager } from '../core/config';
import { ProjectDetector } from '../core/project-detector';

export async function statusCommand(): Promise<void> {
  try {
    const directorySafety = new DirectorySafety();
    const projectRoot = directorySafety.getProjectRoot();
    const workingDir = directorySafety.getWorkingDirectory();
    const configManager = new ConfigManager(projectRoot);
    
    if (configManager.configExists()) {
      const config = await configManager.loadConfig();
      const projectDetector = new ProjectDetector(projectRoot);
      const projectInfo = await projectDetector.detectProject();
      
      console.log(chalk.green('✓ Project Status'));
      console.log(chalk.dim(`  ├─ ${config.project.name} (${projectInfo.language})`));
      console.log(chalk.dim(`  └─ ${path.relative(process.cwd(), workingDir) || 'current directory'}`));
      
    } else {
      console.log(chalk.yellow('⚠️  Project not initialized'));
      console.log(chalk.dim(`  └─ Run: hypercode init`));
    }
    
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    throw error;
  }
}