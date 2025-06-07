import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

export interface Todo {
  id: string;
  title: string;
  description?: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped' | 'blocked';
  priority: 'low' | 'medium' | 'high';
  createdAt: Date;
  updatedAt: Date;
  estimatedTokens?: number;
  actualTokens?: number;
  dependencies?: string[];
  tags?: string[];
}

export interface TodoGroup {
  id: string;
  title: string;
  description?: string;
  todos: Todo[];
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
  estimatedTokens?: number;
  actualTokens?: number;
}

export interface TodoProgress {
  total: number;
  completed: number;
  inProgress: number;
  pending: number;
  skipped: number;
  blocked: number;
  percentage: number;
  estimatedTokensRemaining: number;
}

export class TodoManager {
  private projectRoot: string;
  private sessionId: string;
  private todoFilePath: string;
  private currentGroup: TodoGroup | null = null;
  private groups: TodoGroup[] = [];

  constructor(projectRoot: string, sessionId: string) {
    this.projectRoot = projectRoot;
    this.sessionId = sessionId;
    this.todoFilePath = path.join(projectRoot, '.hypercode', 'todos', `${sessionId}.json`);
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(path.dirname(this.todoFilePath));
    await this.loadTodos();
  }

  async createTodoGroup(title: string, description?: string, estimatedTokens?: number): Promise<string> {
    const group: TodoGroup = {
      id: this.generateId(),
      title,
      description,
      todos: [],
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      estimatedTokens
    };

    this.groups.push(group);
    this.currentGroup = group;
    await this.saveTodos();
    return group.id;
  }

  async addTodo(
    title: string,
    options: {
      description?: string;
      priority?: 'low' | 'medium' | 'high';
      estimatedTokens?: number;
      dependencies?: string[];
      tags?: string[];
      groupId?: string;
    } = {}
  ): Promise<string> {
    const todo: Todo = {
      id: this.generateId(),
      title,
      description: options.description,
      status: 'pending',
      priority: options.priority || 'medium',
      createdAt: new Date(),
      updatedAt: new Date(),
      estimatedTokens: options.estimatedTokens,
      dependencies: options.dependencies || [],
      tags: options.tags || []
    };

    let targetGroup = this.currentGroup;
    if (options.groupId) {
      targetGroup = this.groups.find(g => g.id === options.groupId) || this.currentGroup;
    }

    if (!targetGroup) {
      await this.createTodoGroup('Default Tasks');
      targetGroup = this.currentGroup!;
    }

    targetGroup.todos.push(todo);
    targetGroup.updatedAt = new Date();
    await this.saveTodos();
    return todo.id;
  }

  async updateTodoStatus(
    todoId: string, 
    status: Todo['status'], 
    actualTokens?: number
  ): Promise<void> {
    const { group, todo } = this.findTodo(todoId);
    if (!todo || !group) {
      throw new Error(`Todo with id ${todoId} not found`);
    }

    const oldStatus = todo.status;
    todo.status = status;
    todo.updatedAt = new Date();
    
    if (actualTokens !== undefined) {
      todo.actualTokens = actualTokens;
    }

    // Update group status based on todos
    this.updateGroupStatus(group);
    await this.saveTodos();

    // Log status change for user visibility
    this.logStatusChange(todo, oldStatus, status);
  }

  async getProgress(groupId?: string): Promise<TodoProgress> {
    const todos = groupId 
      ? this.groups.find(g => g.id === groupId)?.todos || []
      : this.getAllTodos();

    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const skipped = todos.filter(t => t.status === 'skipped').length;
    const blocked = todos.filter(t => t.status === 'blocked').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const remainingTodos = todos.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const estimatedTokensRemaining = remainingTodos.reduce((sum, todo) => 
      sum + (todo.estimatedTokens || 1000), 0
    );

    return {
      total,
      completed,
      inProgress,
      pending,
      skipped,
      blocked,
      percentage,
      estimatedTokensRemaining
    };
  }

  async getCurrentTodo(): Promise<Todo | null> {
    const inProgressTodos = this.getAllTodos().filter(t => t.status === 'in_progress');
    return inProgressTodos[0] || null;
  }

  async getNextTodo(): Promise<Todo | null> {
    const pendingTodos = this.getAllTodos()
      .filter(t => t.status === 'pending')
      .filter(t => this.areDependenciesMet(t))
      .sort((a, b) => {
        // Sort by priority first, then by creation date
        const priorityWeight = { high: 3, medium: 2, low: 1 };
        const aPriority = priorityWeight[a.priority];
        const bPriority = priorityWeight[b.priority];
        
        if (aPriority !== bPriority) {
          return bPriority - aPriority;
        }
        
        return a.createdAt.getTime() - b.createdAt.getTime();
      });

    return pendingTodos[0] || null;
  }

  async continueFromLastCheckpoint(): Promise<Todo | null> {
    // First check if there's a todo in progress
    const currentTodo = await this.getCurrentTodo();
    if (currentTodo) {
      return currentTodo;
    }

    // Otherwise get the next pending todo
    const nextTodo = await this.getNextTodo();
    if (nextTodo) {
      await this.updateTodoStatus(nextTodo.id, 'in_progress');
      return nextTodo;
    }

    return null;
  }

  async skipTodo(todoId: string, reason?: string): Promise<void> {
    const { todo } = this.findTodo(todoId);
    if (!todo) {
      throw new Error(`Todo with id ${todoId} not found`);
    }

    await this.updateTodoStatus(todoId, 'skipped');
    
    if (reason) {
      todo.description = (todo.description || '') + `\n[SKIPPED: ${reason}]`;
    }

    console.log(chalk.yellow(`⏭️  Skipped: ${todo.title}`));
    if (reason) {
      console.log(chalk.dim(`   Reason: ${reason}`));
    }
  }

  async saveCheckpoint(): Promise<void> {
    const checkpointData = {
      sessionId: this.sessionId,
      timestamp: new Date().toISOString(),
      groups: this.groups,
      currentGroupId: this.currentGroup?.id
    };

    const checkpointPath = path.join(
      this.projectRoot, 
      '.hypercode', 
      'checkpoints', 
      `${this.sessionId}_${Date.now()}.json`
    );

    await fs.ensureDir(path.dirname(checkpointPath));
    await fs.writeJSON(checkpointPath, checkpointData, { spaces: 2 });
    
    console.log(chalk.green(`💾 Checkpoint saved: ${path.basename(checkpointPath)}`));
  }

  getTodoCount(): number {
    return this.getAllTodos().filter(t => t.status === 'pending' || t.status === 'in_progress').length;
  }

  formatTodoList(groupId?: string, options: { showCompleted?: boolean } = {}): string {
    const groups = groupId ? this.groups.filter(g => g.id === groupId) : this.groups;
    
    if (groups.length === 0) {
      return chalk.dim('No todos found.');
    }

    let output = '';

    for (const group of groups) {
      const progress = this.calculateGroupProgress(group);
      const progressBar = this.createProgressBar(progress.percentage);
      
      output += `\n${chalk.bold(group.title)} ${progressBar} ${progress.percentage}%\n`;
      if (group.description) {
        output += chalk.dim(`⎿  ${group.description}\n`);
      }

      let displayTodos = group.todos;
      if (!options.showCompleted) {
        displayTodos = group.todos.filter(t => t.status !== 'completed');
      }

      for (let i = 0; i < displayTodos.length; i++) {
        const todo = displayTodos[i];
        const isLast = i === displayTodos.length - 1;
        const prefix = isLast ? '   ⎿ ' : '   ├ ';
        
        output += prefix + this.formatTodoItem(todo) + '\n';
      }
    }

    return output;
  }

  private formatTodoItem(todo: Todo): string {
    let icon: string;
    let color: typeof chalk.green;

    switch (todo.status) {
      case 'completed':
        icon = '✅';
        color = chalk.green;
        break;
      case 'in_progress':
        icon = '🔄';
        color = chalk.yellow;
        break;
      case 'blocked':
        icon = '🚫';
        color = chalk.red;
        break;
      case 'skipped':
        icon = '⏭️';
        color = chalk.dim;
        break;
      default:
        icon = '☐';
        color = chalk.white;
    }

    let text = `${icon} ${todo.title}`;
    
    if (todo.priority === 'high') {
      text += chalk.red(' (!!)');
    } else if (todo.priority === 'low') {
      text += chalk.dim(' (low)');
    }

    if (todo.estimatedTokens) {
      text += chalk.dim(` (~${todo.estimatedTokens} tokens)`);
    }

    return color(text);
  }

  private generateId(): string {
    return Math.random().toString(36).substr(2, 9);
  }

  private findTodo(todoId: string): { group: TodoGroup | null; todo: Todo | null } {
    for (const group of this.groups) {
      const todo = group.todos.find(t => t.id === todoId);
      if (todo) {
        return { group, todo };
      }
    }
    return { group: null, todo: null };
  }

  private getAllTodos(): Todo[] {
    return this.groups.flatMap(g => g.todos);
  }

  private areDependenciesMet(todo: Todo): boolean {
    if (!todo.dependencies || todo.dependencies.length === 0) {
      return true;
    }

    return todo.dependencies.every(depId => {
      const { todo: depTodo } = this.findTodo(depId);
      return depTodo?.status === 'completed';
    });
  }

  private updateGroupStatus(group: TodoGroup): void {
    const todos = group.todos;
    if (todos.length === 0) {
      group.status = 'pending';
      return;
    }

    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const total = todos.length;

    if (completed === total) {
      group.status = 'completed';
    } else if (inProgress > 0 || completed > 0) {
      group.status = 'in_progress';
    } else {
      group.status = 'pending';
    }

    group.updatedAt = new Date();
  }

  private calculateGroupProgress(group: TodoGroup): TodoProgress {
    const todos = group.todos;
    const total = todos.length;
    const completed = todos.filter(t => t.status === 'completed').length;
    const inProgress = todos.filter(t => t.status === 'in_progress').length;
    const pending = todos.filter(t => t.status === 'pending').length;
    const skipped = todos.filter(t => t.status === 'skipped').length;
    const blocked = todos.filter(t => t.status === 'blocked').length;
    const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

    const remainingTodos = todos.filter(t => t.status === 'pending' || t.status === 'in_progress');
    const estimatedTokensRemaining = remainingTodos.reduce((sum, todo) => 
      sum + (todo.estimatedTokens || 1000), 0
    );

    return {
      total,
      completed,
      inProgress,
      pending,
      skipped,
      blocked,
      percentage,
      estimatedTokensRemaining
    };
  }

  private createProgressBar(percentage: number, width: number = 20): string {
    const filled = Math.round((percentage / 100) * width);
    const empty = width - filled;
    return chalk.green('█'.repeat(filled)) + chalk.dim('░'.repeat(empty));
  }

  private logStatusChange(todo: Todo, oldStatus: string, newStatus: string): void {
    if (oldStatus === newStatus) return;

    const statusEmojis: Record<string, string> = {
      pending: '⏸️',
      in_progress: '▶️',
      completed: '✅',
      skipped: '⏭️',
      blocked: '🚫'
    };

    const emoji = statusEmojis[newStatus] || '📝';
    console.log(chalk.dim(`${emoji} ${todo.title}: ${oldStatus} → ${newStatus}`));
  }

  private async loadTodos(): Promise<void> {
    try {
      if (await fs.pathExists(this.todoFilePath)) {
        const data = await fs.readJSON(this.todoFilePath);
        this.groups = data.groups || [];
        
        // Convert string dates back to Date objects
        this.groups.forEach(group => {
          group.createdAt = new Date(group.createdAt);
          group.updatedAt = new Date(group.updatedAt);
          group.todos.forEach(todo => {
            todo.createdAt = new Date(todo.createdAt);
            todo.updatedAt = new Date(todo.updatedAt);
          });
        });

        if (data.currentGroupId) {
          this.currentGroup = this.groups.find(g => g.id === data.currentGroupId) || null;
        }
      }
    } catch (error) {
      console.warn(chalk.yellow('Warning: Could not load existing todos'), error);
      this.groups = [];
      this.currentGroup = null;
    }
  }

  private async saveTodos(): Promise<void> {
    const data = {
      sessionId: this.sessionId,
      groups: this.groups,
      currentGroupId: this.currentGroup?.id,
      lastUpdated: new Date().toISOString()
    };

    await fs.writeJSON(this.todoFilePath, data, { spaces: 2 });
  }
}