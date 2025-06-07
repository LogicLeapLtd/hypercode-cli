import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { DirectorySafety } from '../core/directory-safety';
import { ProjectDetector } from '../core/project-detector';
import { ConfigManager } from '../core/config';
import { ApiKeyManager } from '../utils/api-key-manager';

export async function initCommand(projectType?: string): Promise<void> {
  const spinner = ora('Initializing HyperCode...').start();
  
  try {
    const directorySafety = new DirectorySafety();
    const projectRoot = directorySafety.getProjectRoot();
    const workingDir = directorySafety.getWorkingDirectory();
    
    spinner.text = 'Detecting project structure...';
    const projectDetector = new ProjectDetector(projectRoot);
    const projectInfo = await projectDetector.detectProject();
    
    if (projectType) {
      projectInfo.type = projectType;
    }
    
    spinner.text = 'Analyzing codebase patterns...';
    const configManager = new ConfigManager(projectRoot);
    
    if (configManager.configExists()) {
      spinner.stop();
      const { overwrite } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'overwrite',
          message: 'HyperCode is already initialized. Overwrite existing configuration?',
          default: false
        }
      ]);
      
      if (!overwrite) {
        console.log(chalk.yellow('Initialization cancelled.'));
        return;
      }
      
      spinner.start('Updating configuration...');
    }
    
    const config = await configManager.initializeFromProject(projectInfo);
    
    spinner.succeed('HyperCode initialized successfully!');
    
    console.log('\n' + chalk.green('✓ Project initialized'));
    console.log(chalk.dim(`  └─ ${config.project.name} (${projectInfo.type})`));
    
    // Check for API keys after initialization
    const apiKeyManager = new ApiKeyManager(projectRoot);
    await apiKeyManager.initialize();
    const hasOpenAIKey = await apiKeyManager.getApiKey('OPENAI_API_KEY');
    
    if (!hasOpenAIKey) {
      console.log(chalk.yellow('\\n💡 Set up your OpenAI API key for intelligent features:'));
      console.log(chalk.cyan('   Run "hypercode" and use /keys add OPENAI_API_KEY'));
    }
    
  } catch (error) {
    spinner.fail('Initialization failed');
    throw error;
  }
}