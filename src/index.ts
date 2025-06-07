#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { version } from '../package.json';
import { initCommand } from './commands/init';
import { statusCommand } from './commands/status';
import { scopeCommand } from './commands/scope';
import { buildCommand } from './commands/build';
import { fixCommand } from './commands/fix';
import { debugCommand } from './commands/debug';
import { gitCommand } from './commands/git';
import { InteractiveAgent } from './agent/interactive-agent';

// Load .env from current working directory (if exists)
dotenv.config();

const program = new Command();

program
  .name('hypercode')
  .description('Lightning-fast CLI coding agent for generating complete applications and features')
  .version(version);

program
  .command('init')
  .description('Initialize and detect current project')
  .argument('[project-type]', 'Specify project type (auto-detect if not provided)')
  .action(initCommand);

program
  .command('status')
  .description('Show current project context and working directory')
  .action(statusCommand);

program
  .command('scope')
  .description('Show which files are in scope for operations')
  .action(scopeCommand);

program
  .command('build')
  .description('Generate complete feature')
  .argument('<feature>', 'Feature description to build')
  .option('-d, --debug', 'Enable debug mode')
  .action(buildCommand);

program
  .command('fix')
  .description('Fix specific issues')
  .argument('<target>', 'File path or error description to fix')
  .action(fixCommand);

program
  .command('debug')
  .description('Show multi-model reasoning traces for last command')
  .option('--trace', 'Show each model\'s decision process')
  .option('--confidence', 'Display certainty scores')
  .option('--alternatives', 'Generate different implementation approaches')
  .action(debugCommand);

program
  .command('git')
  .description('Git integration commands')
  .argument('[subcommand]', 'Git subcommand (status, setup, push, branch, commit)')
  .argument('[...args]', 'Additional arguments')
  .action(async (subcommand, args) => {
    await gitCommand(subcommand, ...(args || []));
  });

program
  .command('agent')
  .description('Start interactive agent mode')
  .action(async () => {
    const agent = new InteractiveAgent();
    await agent.start();
  });

// Check if running in interactive mode (no arguments provided)
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    // No arguments = Interactive agent mode
    const agent = new InteractiveAgent();
    await agent.start();
  } else {
    // Arguments provided = Traditional command mode
    try {
      await program.parseAsync(process.argv);
    } catch (error) {
      console.error(chalk.red('Error:'), error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error instanceof Error ? error.message : String(error));
  process.exit(1);
});