import chalk from 'chalk';
import * as path from 'path';
import { DirectorySafety } from '../core/directory-safety';
import { ConfigManager } from '../core/config';

export async function scopeCommand(): Promise<void> {
  try {
    const directorySafety = new DirectorySafety();
    const projectRoot = directorySafety.getProjectRoot();
    const configManager = new ConfigManager(projectRoot);
    
    console.log(chalk.green('🔍 Files in Scope\\n'));
    
    if (!configManager.configExists()) {
      console.log(chalk.yellow('⚠️  HyperCode not initialized. Run `hypercode init` first.'));
      return;
    }
    
    const config = await configManager.loadConfig();
    const files = await directorySafety.getSafeFileList();
    
    if (files.length === 0) {
      console.log(chalk.yellow('No files found in scope.'));
      return;
    }
    
    console.log(chalk.blue(`📁 Project Root: ${projectRoot}`));
    console.log(chalk.blue(`📊 Total Files: ${files.length}\\n`));
    
    const filesByExtension = new Map<string, string[]>();
    const fileSizes = new Map<string, number>();
    
    for (const file of files) {
      const ext = path.extname(file) || 'no extension';
      const relativePath = directorySafety.getRelativePath(file);
      
      if (!filesByExtension.has(ext)) {
        filesByExtension.set(ext, []);
      }
      filesByExtension.get(ext)!.push(relativePath);
      
      try {
        const fs = await import('fs-extra');
        const stats = await fs.stat(file);
        fileSizes.set(relativePath, stats.size);
      } catch (error) {
        // File might have been deleted, skip
      }
    }
    
    const sortedExtensions = Array.from(filesByExtension.entries())
      .sort((a, b) => b[1].length - a[1].length);
    
    console.log(chalk.blue('📋 Files by Type:\\n'));
    
    for (const [ext, fileList] of sortedExtensions) {
      const displayExt = ext === 'no extension' ? chalk.dim('(no extension)') : chalk.cyan(ext);
      console.log(`${displayExt} ${chalk.dim('(' + fileList.length + ' files)')}`);
      
      const sortedFiles = fileList
        .sort()
        .slice(0, 10);
      
      for (const file of sortedFiles) {
        const size = fileSizes.get(file);
        const sizeStr = size ? chalk.dim(` (${formatFileSize(size)})`) : '';
        console.log(`  ${chalk.dim('├─')} ${file}${sizeStr}`);
      }
      
      if (fileList.length > 10) {
        console.log(`  ${chalk.dim('└─')} ${chalk.dim(`... and ${fileList.length - 10} more files`)}`);
      }
      
      console.log();
    }
    
    console.log(chalk.blue('🚫 Excluded Patterns:'));
    config.project.exclude.forEach(pattern => {
      console.log(`  ${chalk.dim(pattern)}`);
    });
    
    const totalSize = Array.from(fileSizes.values()).reduce((sum, size) => sum + size, 0);
    console.log('\\n' + chalk.green(`📊 Summary: ${files.length} files, ${formatFileSize(totalSize)} total`));
    
  } catch (error) {
    console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
    throw error;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}