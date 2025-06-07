import * as fs from 'fs-extra';
import * as path from 'path';

export interface ProjectInfo {
  type: string;
  name: string;
  framework?: string;
  language: string;
  packageManager?: string;
  techStack: string[];
  codeStyle: {
    indent: string;
    semicolons: boolean;
    quotes: 'single' | 'double';
  };
  testFramework?: string;
}

export class ProjectDetector {
  private projectRoot: string;

  constructor(projectRoot: string) {
    this.projectRoot = projectRoot;
  }

  async detectProject(): Promise<ProjectInfo> {
    const packageJsonPath = path.join(this.projectRoot, 'package.json');
    const cargoTomlPath = path.join(this.projectRoot, 'Cargo.toml');
    const goModPath = path.join(this.projectRoot, 'go.mod');
    const requirementsPath = path.join(this.projectRoot, 'requirements.txt');
    const pyprojectPath = path.join(this.projectRoot, 'pyproject.toml');

    if (fs.existsSync(packageJsonPath)) {
      return this.detectNodeProject(packageJsonPath);
    } else if (fs.existsSync(cargoTomlPath)) {
      return this.detectRustProject(cargoTomlPath);
    } else if (fs.existsSync(goModPath)) {
      return this.detectGoProject(goModPath);
    } else if (fs.existsSync(pyprojectPath)) {
      return this.detectPythonProject(pyprojectPath);
    } else if (fs.existsSync(requirementsPath)) {
      return this.detectPythonProjectLegacy(requirementsPath);
    } else {
      return this.detectGenericProject();
    }
  }

  private async detectNodeProject(packageJsonPath: string): Promise<ProjectInfo> {
    const packageJson = await fs.readJson(packageJsonPath);
    const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
    
    let framework = 'node';
    let type = 'node';
    const techStack: string[] = [];

    if (dependencies.react) {
      framework = 'react';
      techStack.push('React');
      
      if (dependencies.next) {
        framework = 'nextjs';
        type = 'nextjs';
        techStack.push('Next.js');
      } else if (dependencies['@vitejs/plugin-react']) {
        type = 'react-vite';
        techStack.push('Vite');
      } else if (dependencies['react-scripts']) {
        type = 'create-react-app';
        techStack.push('Create React App');
      }
    } else if (dependencies.vue) {
      framework = 'vue';
      type = 'vue';
      techStack.push('Vue.js');
      
      if (dependencies.nuxt) {
        framework = 'nuxt';
        type = 'nuxt';
        techStack.push('Nuxt.js');
      }
    } else if (dependencies.express) {
      type = 'express';
      techStack.push('Express.js');
    } else if (dependencies.nestjs || dependencies['@nestjs/core']) {
      type = 'nestjs';
      techStack.push('NestJS');
    }

    const language = dependencies.typescript || dependencies['@types/node'] ? 'typescript' : 'javascript';
    if (language === 'typescript') techStack.push('TypeScript');

    if (dependencies.tailwindcss) techStack.push('Tailwind CSS');
    if (dependencies.prisma) techStack.push('Prisma');
    if (dependencies.mongoose) techStack.push('MongoDB/Mongoose');

    const packageManager = this.detectPackageManager();
    const testFramework = this.detectTestFramework(dependencies);
    const codeStyle = await this.detectCodeStyle();

    return {
      type,
      name: packageJson.name || path.basename(this.projectRoot),
      framework,
      language,
      packageManager,
      techStack,
      codeStyle,
      testFramework
    };
  }

  private async detectRustProject(cargoTomlPath: string): Promise<ProjectInfo> {
    const cargoContent = await fs.readFile(cargoTomlPath, 'utf8');
    const nameMatch = cargoContent.match(/name\s*=\s*"([^"]+)"/);
    
    return {
      type: 'rust',
      name: nameMatch ? nameMatch[1] : path.basename(this.projectRoot),
      language: 'rust',
      techStack: ['Rust', 'Cargo'],
      codeStyle: {
        indent: '4 spaces',
        semicolons: true,
        quotes: 'double'
      }
    };
  }

  private async detectGoProject(goModPath: string): Promise<ProjectInfo> {
    const goModContent = await fs.readFile(goModPath, 'utf8');
    const moduleMatch = goModContent.match(/module\s+([^\s]+)/);
    
    return {
      type: 'go',
      name: moduleMatch ? path.basename(moduleMatch[1]) : path.basename(this.projectRoot),
      language: 'go',
      techStack: ['Go'],
      codeStyle: {
        indent: 'tabs',
        semicolons: true,
        quotes: 'double'
      }
    };
  }

  private async detectPythonProject(pyprojectPath: string): Promise<ProjectInfo> {
    const pyprojectContent = await fs.readFile(pyprojectPath, 'utf8');
    const nameMatch = pyprojectContent.match(/name\s*=\s*"([^"]+)"/);
    
    const techStack = ['Python'];
    if (pyprojectContent.includes('fastapi')) techStack.push('FastAPI');
    if (pyprojectContent.includes('django')) techStack.push('Django');
    if (pyprojectContent.includes('flask')) techStack.push('Flask');
    
    return {
      type: 'python',
      name: nameMatch ? nameMatch[1] : path.basename(this.projectRoot),
      language: 'python',
      techStack,
      codeStyle: {
        indent: '4 spaces',
        semicolons: false,
        quotes: 'single'
      },
      testFramework: pyprojectContent.includes('pytest') ? 'pytest' : undefined
    };
  }

  private async detectPythonProjectLegacy(requirementsPath: string): Promise<ProjectInfo> {
    const requirements = await fs.readFile(requirementsPath, 'utf8');
    const techStack = ['Python'];
    
    if (requirements.includes('fastapi')) techStack.push('FastAPI');
    if (requirements.includes('django')) techStack.push('Django');
    if (requirements.includes('flask')) techStack.push('Flask');
    
    return {
      type: 'python',
      name: path.basename(this.projectRoot),
      language: 'python',
      techStack,
      codeStyle: {
        indent: '4 spaces',
        semicolons: false,
        quotes: 'single'
      },
      testFramework: requirements.includes('pytest') ? 'pytest' : undefined
    };
  }

  private async detectGenericProject(): Promise<ProjectInfo> {
    return {
      type: 'generic',
      name: path.basename(this.projectRoot),
      language: 'unknown',
      techStack: [],
      codeStyle: {
        indent: '2 spaces',
        semicolons: true,
        quotes: 'single'
      }
    };
  }

  private detectPackageManager(): string {
    if (fs.existsSync(path.join(this.projectRoot, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(this.projectRoot, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(this.projectRoot, 'package-lock.json'))) return 'npm';
    return 'npm';
  }

  private detectTestFramework(dependencies: Record<string, string>): string | undefined {
    if (dependencies.jest) return 'jest';
    if (dependencies.vitest) return 'vitest';
    if (dependencies.mocha) return 'mocha';
    if (dependencies['@testing-library/react']) return 'jest + react-testing-library';
    return undefined;
  }

  private async detectCodeStyle(): Promise<{ indent: string; semicolons: boolean; quotes: 'single' | 'double' }> {
    const prettierConfigPath = path.join(this.projectRoot, '.prettierrc');
    const eslintConfigPath = path.join(this.projectRoot, '.eslintrc.json');
    
    let indent = '2 spaces';
    let semicolons = true;
    let quotes: 'single' | 'double' = 'single';

    if (fs.existsSync(prettierConfigPath)) {
      try {
        const prettierConfig = await fs.readJson(prettierConfigPath);
        if (prettierConfig.tabWidth) indent = `${prettierConfig.tabWidth} spaces`;
        if (prettierConfig.useTabs) indent = 'tabs';
        if (typeof prettierConfig.semi === 'boolean') semicolons = prettierConfig.semi;
        if (prettierConfig.singleQuote === false) quotes = 'double';
      } catch (e) {
        // Ignore parsing errors
      }
    }

    if (fs.existsSync(eslintConfigPath)) {
      try {
        const eslintConfig = await fs.readJson(eslintConfigPath);
        const rules = eslintConfig.rules || {};
        if (rules.semi && rules.semi[1] === 'never') semicolons = false;
        if (rules.quotes && rules.quotes[1] === 'double') quotes = 'double';
      } catch (e) {
        // Ignore parsing errors
      }
    }

    return { indent, semicolons, quotes };
  }
}