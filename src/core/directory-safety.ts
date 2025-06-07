import * as path from 'path';
import * as fs from 'fs-extra';

export class DirectorySafety {
  private workingDirectory: string;
  private projectRoot: string;

  constructor() {
    this.workingDirectory = process.cwd();
    this.projectRoot = this.findProjectRoot();
  }

  private findProjectRoot(): string {
    let currentDir = this.workingDirectory;
    
    while (currentDir !== path.dirname(currentDir)) {
      const indicators = [
        '.git',
        'package.json',
        'Cargo.toml',
        'go.mod',
        'requirements.txt',
        'pyproject.toml',
        '.hypercode.json'
      ];
      
      for (const indicator of indicators) {
        if (fs.existsSync(path.join(currentDir, indicator))) {
          return currentDir;
        }
      }
      
      currentDir = path.dirname(currentDir);
    }
    
    return this.workingDirectory;
  }

  isPathSafe(targetPath: string): boolean {
    const resolvedPath = path.resolve(targetPath);
    const resolvedRoot = path.resolve(this.projectRoot);
    
    return resolvedPath.startsWith(resolvedRoot);
  }

  validatePath(targetPath: string): void {
    if (!this.isPathSafe(targetPath)) {
      throw new Error(`Access denied: Path '${targetPath}' is outside project boundary '${this.projectRoot}'`);
    }
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  getProjectRoot(): string {
    return this.projectRoot;
  }

  getRelativePath(fullPath: string): string {
    return path.relative(this.projectRoot, fullPath);
  }

  async getSafeFileList(patterns: string[] = ['**/*']): Promise<string[]> {
    const glob = await import('glob');
    const allFiles: string[] = [];
    
    for (const pattern of patterns) {
      const files = await glob.glob(pattern, {
        cwd: this.projectRoot,
        ignore: this.getIgnorePatterns(),
        nodir: true
      });
      allFiles.push(...files);
    }
    
    return [...new Set(allFiles)].map(file => path.join(this.projectRoot, file));
  }

  private getIgnorePatterns(): string[] {
    const defaultIgnores = [
      'node_modules/**',
      '.git/**',
      'dist/**',
      'build/**',
      '.next/**',
      '.nuxt/**',
      'target/**',
      '__pycache__/**',
      '*.pyc',
      '.DS_Store',
      'Thumbs.db'
    ];

    const hypercodeignorePath = path.join(this.projectRoot, '.hypercodeignore');
    if (fs.existsSync(hypercodeignorePath)) {
      const customIgnores = fs.readFileSync(hypercodeignorePath, 'utf8')
        .split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      return [...defaultIgnores, ...customIgnores];
    }

    return defaultIgnores;
  }
}