import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

// Current API pricing as of December 2024 (per 1M tokens)
// Sources: Official provider pricing pages
export const API_PRICING = {
  openai: {
    'gpt-4.1-mini': { input: 0.15, output: 0.60 }
  }
} as const;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface ModelCost {
  model: string;
  provider: string;
  tokens: TokenUsage;
  cost: number;
  timestamp: number;
}

export interface SessionCosts {
  sessionId: string;
  startTime: number;
  totalCost: number;
  modelCosts: ModelCost[];
  requestCount: number;
}

export class CostTracker {
  private sessionCosts: SessionCosts;
  private costFilePath: string;
  private dailySpendingLimit: number;

  constructor(projectRoot: string, dailyLimit: number = 50.00) {
    this.costFilePath = path.join(projectRoot, '.hypercode', 'costs.json');
    this.dailySpendingLimit = dailyLimit;
    this.sessionCosts = {
      sessionId: this.generateSessionId(),
      startTime: Date.now(),
      totalCost: 0,
      modelCosts: [],
      requestCount: 0
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async initialize(): Promise<void> {
    await fs.ensureFile(this.costFilePath);
    
    // Check daily spending limit
    const dailySpending = await this.getDailySpending();
    if (dailySpending >= this.dailySpendingLimit) {
      throw new Error(`Daily spending limit of $${this.dailySpendingLimit.toFixed(2)} reached. Current: $${dailySpending.toFixed(2)}`);
    }
  }

  calculateCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): number {
    const pricing = this.getPricing(provider, model);
    if (!pricing) {
      console.warn(`Unknown pricing for ${provider}/${model}, using estimated $0.01 per 1K tokens`);
      return ((inputTokens + outputTokens) / 1000) * 0.01;
    }

    const inputCost = (inputTokens / 1_000_000) * pricing.input;
    const outputCost = (outputTokens / 1_000_000) * pricing.output;
    
    return inputCost + outputCost;
  }

  private getPricing(provider: string, model: string): { input: number; output: number } | null {
    const providerPricing = API_PRICING[provider as keyof typeof API_PRICING];
    if (!providerPricing) return null;
    
    return providerPricing[model as keyof typeof providerPricing] || null;
  }

  async trackModelUsage(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number
  ): Promise<ModelCost> {
    const cost = this.calculateCost(provider, model, inputTokens, outputTokens);
    
    const modelCost: ModelCost = {
      model,
      provider,
      tokens: {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
      },
      cost,
      timestamp: Date.now()
    };

    this.sessionCosts.modelCosts.push(modelCost);
    this.sessionCosts.totalCost += cost;
    this.sessionCosts.requestCount++;

    await this.saveCosts();
    return modelCost;
  }

  // Rough estimation: 1 token ≈ 4 characters for English text
  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  estimateCostBeforeCall(
    provider: string,
    model: string,
    inputText: string,
    expectedOutputTokens: number = 500
  ): { estimatedInputTokens: number; estimatedOutputTokens: number; estimatedCost: number } {
    const inputTokens = this.estimateTokens(inputText);
    const cost = this.calculateCost(provider, model, inputTokens, expectedOutputTokens);
    
    return {
      estimatedInputTokens: inputTokens,
      estimatedOutputTokens: expectedOutputTokens,
      estimatedCost: cost
    };
  }

  async checkCostWarning(estimatedCost: number): Promise<boolean> {
    if (estimatedCost > 5.00) {
      return true; // Trigger warning for expensive operations
    }

    const dailySpending = await this.getDailySpending();
    if (dailySpending + estimatedCost > this.dailySpendingLimit) {
      return true; // Trigger warning for daily limit
    }

    return false;
  }

  getSessionTotal(): number {
    return this.sessionCosts.totalCost;
  }

  getFormattedSessionTotal(): string {
    return chalk.green(`💰 $${this.sessionCosts.totalCost.toFixed(4)}`);
  }

  generateCostBreakdown(): string {
    if (this.sessionCosts.modelCosts.length === 0) {
      return chalk.dim('No costs incurred this session.');
    }

    const lines = [
      chalk.blue('┌─────────────────────────────────────────────────────┐'),
      chalk.blue('│ Model Usage & Costs:                                │')
    ];

    // Group by model for cleaner display
    const modelGroups = new Map<string, ModelCost[]>();
    for (const cost of this.sessionCosts.modelCosts) {
      const key = `${cost.provider}/${cost.model}`;
      if (!modelGroups.has(key)) {
        modelGroups.set(key, []);
      }
      modelGroups.get(key)!.push(cost);
    }

    for (const [modelKey, costs] of modelGroups) {
      const totalCost = costs.reduce((sum, c) => sum + c.cost, 0);
      const totalInput = costs.reduce((sum, c) => sum + c.tokens.inputTokens, 0);
      const totalOutput = costs.reduce((sum, c) => sum + c.tokens.outputTokens, 0);
      
      const line = `│ ⚡ ${modelKey}: ${totalInput.toLocaleString()} in + ${totalOutput.toLocaleString()} out = $${totalCost.toFixed(4)}`.padEnd(53) + '│';
      lines.push(chalk.blue(line));
    }

    lines.push(chalk.blue('│                                                     │'));
    lines.push(chalk.blue(`│ 💰 This request: $${this.getLastRequestCost().toFixed(4)}`.padEnd(53) + '│'));
    lines.push(chalk.blue(`│ 💰 Session total: $${this.sessionCosts.totalCost.toFixed(4)}`.padEnd(53) + '│'));
    lines.push(chalk.blue('└─────────────────────────────────────────────────────┘'));

    return lines.join('\n');
  }

  private getLastRequestCost(): number {
    if (this.sessionCosts.modelCosts.length === 0) return 0;
    
    const lastTimestamp = Math.max(...this.sessionCosts.modelCosts.map(c => c.timestamp));
    return this.sessionCosts.modelCosts
      .filter(c => c.timestamp === lastTimestamp)
      .reduce((sum, c) => sum + c.cost, 0);
  }

  async generateSessionSummary(): Promise<string> {
    const duration = (Date.now() - this.sessionCosts.startTime) / 1000 / 60; // minutes
    const dailySpending = await this.getDailySpending();
    
    const lines = [
      chalk.green('\n📊 Session Summary'),
      chalk.blue(`Duration: ${duration.toFixed(1)} minutes`),
      chalk.blue(`Requests: ${this.sessionCosts.requestCount}`),
      chalk.blue(`Session Cost: $${this.sessionCosts.totalCost.toFixed(4)}`),
      chalk.blue(`Daily Total: $${dailySpending.toFixed(4)}`),
      chalk.blue(`Daily Limit: $${this.dailySpendingLimit.toFixed(2)}`)
    ];

    if (this.sessionCosts.modelCosts.length > 0) {
      lines.push('\n' + chalk.yellow('Cost Breakdown:'));
      const modelGroups = new Map<string, number>();
      
      for (const cost of this.sessionCosts.modelCosts) {
        const key = `${cost.provider}/${cost.model}`;
        modelGroups.set(key, (modelGroups.get(key) || 0) + cost.cost);
      }

      for (const [model, cost] of modelGroups) {
        lines.push(`  ${model}: $${cost.toFixed(4)}`);
      }
    }

    return lines.join('\n');
  }

  private async getDailySpending(): Promise<number> {
    try {
      const allCosts = await fs.readJson(this.costFilePath);
      const today = new Date().toDateString();
      
      return allCosts
        .filter((session: SessionCosts) => new Date(session.startTime).toDateString() === today)
        .reduce((sum: number, session: SessionCosts) => sum + session.totalCost, 0);
    } catch (error) {
      return 0; // File doesn't exist or is empty
    }
  }

  private async saveCosts(): Promise<void> {
    try {
      let allCosts: SessionCosts[] = [];
      
      if (await fs.pathExists(this.costFilePath)) {
        try {
          allCosts = await fs.readJson(this.costFilePath);
        } catch (jsonError) {
          console.warn('Cost file corrupted, creating new one...');
          allCosts = [];
        }
      }

      // Update or add current session
      const existingIndex = allCosts.findIndex(s => s.sessionId === this.sessionCosts.sessionId);
      if (existingIndex >= 0) {
        allCosts[existingIndex] = this.sessionCosts;
      } else {
        allCosts.push(this.sessionCosts);
      }

      // Keep only last 30 days of data
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      allCosts = allCosts.filter(s => s.startTime > thirtyDaysAgo);

      await fs.writeJson(this.costFilePath, allCosts, { spaces: 2 });
    } catch (error) {
      console.warn('Failed to save cost data:', error);
    }
  }

  async cleanup(): Promise<void> {
    await this.saveCosts();
  }
}