import * as fs from 'fs-extra';
import * as path from 'path';
import * as os from 'os';
import chalk from 'chalk';
import inquirer from 'inquirer';

export class ApiKeyManager {
  private configPath: string;
  private globalConfigPath: string;

  constructor(projectRoot?: string) {
    // Global config in home directory
    this.globalConfigPath = path.join(os.homedir(), '.hypercode', 'config.json');
    
    // Project-specific config (optional)
    this.configPath = projectRoot 
      ? path.join(projectRoot, '.hypercode', 'config.json')
      : this.globalConfigPath;
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(path.dirname(this.globalConfigPath));
  }

  async getApiKey(keyName: string): Promise<string | undefined> {
    // TODO: Set your API key in environment variable or config

    // First check environment variable
    const envKey = process.env[keyName];
    if (envKey) {
      return envKey;
    }

    // Then check stored config
    try {
      const config = await this.loadConfig();
      return config.apiKeys?.[keyName];
    } catch {
      return undefined;
    }
  }

  async promptForApiKey(keyName: string, description: string): Promise<string | null> {
    console.log(chalk.yellow(`\n⚠️  ${keyName} not found`));
    console.log(chalk.blue(description));
    
    const { shouldSetup } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'shouldSetup',
        message: `Would you like to set up ${keyName} now?`,
        default: true
      }
    ]);

    if (!shouldSetup) {
      return null;
    }

    const { apiKey } = await inquirer.prompt([
      {
        type: 'password',
        name: 'apiKey',
        message: `Enter your ${keyName}:`,
        mask: '*',
        validate: (input: string) => {
          if (!input || input.trim().length === 0) {
            return 'API key cannot be empty';
          }
          if (keyName === 'OPENAI_API_KEY' && !input.startsWith('sk-')) {
            return 'OpenAI API keys should start with "sk-"';
          }
          return true;
        }
      }
    ]);

    const { saveLocation } = await inquirer.prompt([
      {
        type: 'list',
        name: 'saveLocation',
        message: 'Where would you like to save this API key?',
        choices: [
          { name: 'Global (all projects)', value: 'global' },
          { name: 'This project only', value: 'project' },
          { name: 'Don\'t save (session only)', value: 'session' }
        ],
        default: 'global'
      }
    ]);

    if (saveLocation !== 'session') {
      await this.saveApiKey(keyName, apiKey, saveLocation === 'global');
      console.log(chalk.green(`✅ ${keyName} saved successfully!`));
    }

    // Set in process env for current session
    process.env[keyName] = apiKey;
    
    return apiKey;
  }

  async saveApiKey(keyName: string, apiKey: string, global: boolean = true): Promise<void> {
    const configPath = global ? this.globalConfigPath : this.configPath;
    
    let config: any = {};
    try {
      config = await fs.readJSON(configPath);
    } catch {
      // File doesn't exist yet
    }

    if (!config.apiKeys) {
      config.apiKeys = {};
    }

    config.apiKeys[keyName] = apiKey;
    config.lastUpdated = new Date().toISOString();

    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJSON(configPath, config, { spaces: 2, mode: 0o600 }); // Secure file permissions
  }

  async removeApiKey(keyName: string, global: boolean = true): Promise<void> {
    const configPath = global ? this.globalConfigPath : this.configPath;
    
    try {
      const config = await fs.readJSON(configPath);
      if (config.apiKeys && config.apiKeys[keyName]) {
        delete config.apiKeys[keyName];
        await fs.writeJSON(configPath, config, { spaces: 2, mode: 0o600 });
        console.log(chalk.green(`✅ ${keyName} removed successfully`));
      }
    } catch {
      // File doesn't exist
    }
  }

  async listApiKeys(): Promise<void> {
    console.log(chalk.blue('\n🔑 API Key Status:\n'));

    // Check environment variables
    const envKeys = ['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'DEEPSEEK_API_KEY'];
    
    for (const key of envKeys) {
      const value = process.env[key];
      if (value) {
        const masked = this.maskApiKey(value);
        console.log(chalk.green(`✓ ${key}: ${masked} (from environment)`));
      } else {
        const stored = await this.getApiKey(key);
        if (stored) {
          const masked = this.maskApiKey(stored);
          console.log(chalk.yellow(`✓ ${key}: ${masked} (from config)`));
        } else {
          console.log(chalk.red(`✗ ${key}: Not set`));
        }
      }
    }

    // Show config locations
    console.log(chalk.dim(`\nGlobal config: ${this.globalConfigPath}`));
    if (this.configPath !== this.globalConfigPath) {
      console.log(chalk.dim(`Project config: ${this.configPath}`));
    }
  }

  private maskApiKey(key: string): string {
    if (key.length <= 8) {
      return '*'.repeat(key.length);
    }
    return key.substring(0, 4) + '*'.repeat(key.length - 8) + key.substring(key.length - 4);
  }

  private async loadConfig(): Promise<any> {
    // Try project config first, then global
    try {
      if (this.configPath !== this.globalConfigPath && await fs.pathExists(this.configPath)) {
        return await fs.readJSON(this.configPath);
      }
    } catch {
      // Fall through to global
    }

    try {
      return await fs.readJSON(this.globalConfigPath);
    } catch {
      return {};
    }
  }

  async ensureApiKeys(): Promise<boolean> {
    const requiredKeys = [
      {
        name: 'OPENAI_API_KEY',
        description: 'Required for intelligent command routing and code generation.\nGet your key at: https://platform.openai.com/api-keys'
      }
    ];

    let allKeysSet = true;

    for (const { name, description } of requiredKeys) {
      const existing = await this.getApiKey(name);
      if (!existing) {
        const apiKey = await this.promptForApiKey(name, description);
        if (!apiKey) {
          allKeysSet = false;
          console.log(chalk.yellow(`⚠️  ${name} not configured. Some features will be limited.`));
        }
      }
    }

    return allKeysSet;
  }
}