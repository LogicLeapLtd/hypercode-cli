import * as fs from 'fs-extra';
import * as path from 'path';
import { ProjectInfo } from './project-detector';

export interface HyperCodeConfig {
  project: {
    type: string;
    name: string;
    workingDir: string;
    exclude: string[];
  };
  models: {
    speed: string;
    quality: string;
    reasoning: string;
    validation: string;
  };
  codeStyle: {
    indent: string;
    semicolons: boolean;
    quotes: 'single' | 'double';
  };
  macOS?: {
    editor?: string;
    diffTool?: string;
    terminal?: string;
  };
  apiKeys?: {
    openai?: string;
    anthropic?: string;
    deepseek?: string;
  };
}

export class ConfigManager {
  private configPath: string;
  private defaultConfig: HyperCodeConfig;

  constructor(projectRoot: string) {
    this.configPath = path.join(projectRoot, '.hypercode.json');
    this.defaultConfig = {
      project: {
        type: 'generic',
        name: path.basename(projectRoot),
        workingDir: './',
        exclude: ['node_modules', 'dist', '.git', 'build', '.next', 'target', '__pycache__']
      },
      models: {
        speed: 'gpt-4.1-nano',
        quality: 'claude-sonnet-4',
        reasoning: 'deepseek-r1-0528',
        validation: 'deepseek-v3-0324'
      },
      codeStyle: {
        indent: '2 spaces',
        semicolons: true,
        quotes: 'single'
      },
      macOS: {
        editor: 'code',
        diffTool: 'opendiff',
        terminal: 'iterm2'
      }
    };
  }

  async loadConfig(): Promise<HyperCodeConfig> {
    if (await fs.pathExists(this.configPath)) {
      try {
        const userConfig = await fs.readJson(this.configPath);
        return this.mergeConfigs(this.defaultConfig, userConfig);
      } catch (error) {
        console.warn(`Warning: Invalid .hypercode.json file, using defaults: ${error}`);
        return this.defaultConfig;
      }
    }
    return this.defaultConfig;
  }

  async saveConfig(config: HyperCodeConfig): Promise<void> {
    await fs.writeJson(this.configPath, config, { spaces: 2 });
  }

  async initializeFromProject(projectInfo: ProjectInfo): Promise<HyperCodeConfig> {
    const config: HyperCodeConfig = {
      ...this.defaultConfig,
      project: {
        type: projectInfo.type,
        name: projectInfo.name,
        workingDir: './',
        exclude: this.getExcludePatternsForProject(projectInfo)
      },
      codeStyle: projectInfo.codeStyle
    };

    await this.saveConfig(config);
    return config;
  }

  async updateConfig(updates: Partial<HyperCodeConfig>): Promise<HyperCodeConfig> {
    const currentConfig = await this.loadConfig();
    const newConfig = this.mergeConfigs(currentConfig, updates);
    await this.saveConfig(newConfig);
    return newConfig;
  }

  configExists(): boolean {
    return fs.existsSync(this.configPath);
  }

  getConfigPath(): string {
    return this.configPath;
  }

  private mergeConfigs(base: HyperCodeConfig, override: Partial<HyperCodeConfig>): HyperCodeConfig {
    return {
      project: { ...base.project, ...(override.project || {}) },
      models: { ...base.models, ...(override.models || {}) },
      codeStyle: { ...base.codeStyle, ...(override.codeStyle || {}) },
      macOS: { ...base.macOS, ...(override.macOS || {}) },
      apiKeys: { ...base.apiKeys, ...(override.apiKeys || {}) }
    };
  }

  private getExcludePatternsForProject(projectInfo: ProjectInfo): string[] {
    const baseExcludes = ['node_modules', 'dist', '.git', 'build', '.DS_Store', 'Thumbs.db'];
    
    switch (projectInfo.language) {
      case 'javascript':
      case 'typescript':
        return [...baseExcludes, '.next', '.nuxt', 'coverage'];
      case 'python':
        return [...baseExcludes, '__pycache__', '*.pyc', '.venv', 'venv'];
      case 'rust':
        return [...baseExcludes, 'target', 'Cargo.lock'];
      case 'go':
        return [...baseExcludes, 'vendor'];
      default:
        return baseExcludes;
    }
  }

  generateProjectContext(config: HyperCodeConfig, projectInfo: ProjectInfo): string {
    const techStackStr = projectInfo.techStack.join(', ');
    const workingDir = path.resolve(config.project.workingDir);
    
    return `Expert ${projectInfo.language.toUpperCase()}${projectInfo.framework ? ` ${projectInfo.framework}` : ''} developer working on ${config.project.name}.

Current Directory: ${workingDir}
Technology Stack: ${techStackStr}
Code Style: ${config.codeStyle.indent}, ${config.codeStyle.semicolons ? 'semicolons' : 'no semicolons'}, ${config.codeStyle.quotes} quotes
${projectInfo.testFramework ? `Testing: ${projectInfo.testFramework}` : ''}

CONSTRAINTS:
- ONLY modify files within current directory and subdirectories
- Maintain existing code patterns and style conventions
- Follow ${projectInfo.language} best practices and idioms
- Include comprehensive error handling
- Never access files outside the project boundary`;
  }
}