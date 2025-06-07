import OpenAI from 'openai';

export interface ModelResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  confidence?: number;
  processingTime: number;
  model: string;
}

export interface ModelConfig {
  name: string;
  provider: 'openai';
  model: string;
  maxTokens: number;
  temperature: number;
}

export class ModelClient {
  private openai?: OpenAI;
  private configs: Map<string, ModelConfig>;

  constructor(apiKey?: string) {
    this.configs = new Map();
    this.initializeClients(apiKey);
    this.setupDefaultConfigs();
  }

  private initializeClients(apiKey?: string): void {
    const key = apiKey || process.env.OPENAI_API_KEY;
    if (key) {
      this.openai = new OpenAI({
        apiKey: key
      });
    }
  }

  private setupDefaultConfigs(): void {
    // ALL models now use gpt-4.1-mini only
    this.configs.set('speed', {
      name: 'speed',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      maxTokens: 2000,
      temperature: 0.1
    });

    this.configs.set('quality', {
      name: 'quality',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      maxTokens: 3000,
      temperature: 0.2
    });

    this.configs.set('reasoning', {
      name: 'reasoning',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      maxTokens: 4000,
      temperature: 0.1
    });

    this.configs.set('validation', {
      name: 'validation',
      provider: 'openai',
      model: 'gpt-4.1-mini',
      maxTokens: 1500,
      temperature: 0.0
    });
  }

  async generateResponse(
    modelType: string,
    systemPrompt: string,
    userPrompt: string
  ): Promise<ModelResponse> {
    const config = this.configs.get(modelType);
    if (!config) {
      throw new Error(`Unknown model type: ${modelType}`);
    }

    const startTime = Date.now();

    try {
      if (config.provider === 'openai') {
        return await this.generateOpenAI(config, systemPrompt, userPrompt, startTime);
      } else {
        throw new Error(`Unsupported provider: ${config.provider}`);
      }
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.warn(`Model ${modelType} failed:`, error);
      
      return {
        content: `Error: ${error instanceof Error ? error.message : String(error)}`,
        processingTime,
        model: config.model,
        confidence: 0
      };
    }
  }

  private async generateOpenAI(
    config: ModelConfig,
    systemPrompt: string,
    userPrompt: string,
    startTime: number
  ): Promise<ModelResponse> {
    if (!this.openai) {
      throw new Error('OpenAI client not initialized. Set OPENAI_API_KEY environment variable.');
    }

    const response = await this.openai.chat.completions.create({
      model: config.model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      max_tokens: config.maxTokens,
      temperature: config.temperature
    });

    const processingTime = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';

    return {
      content,
      usage: response.usage ? {
        prompt_tokens: response.usage.prompt_tokens,
        completion_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      } : undefined,
      processingTime,
      model: config.model,
      confidence: this.calculateOpenAIConfidence(response)
    };
  }


  private calculateOpenAIConfidence(response: OpenAI.Chat.Completions.ChatCompletion): number {
    // Estimate confidence based on response characteristics
    const choice = response.choices[0];
    if (!choice) return 0;

    let confidence = 0.8; // Base confidence

    // Adjust based on finish reason
    if (choice.finish_reason === 'stop') confidence += 0.1;
    if (choice.finish_reason === 'length') confidence -= 0.2;

    // Adjust based on content length (longer responses often more confident)
    const contentLength = choice.message?.content?.length || 0;
    if (contentLength > 100) confidence += 0.05;
    if (contentLength > 500) confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  async generateParallel(
    modelTypes: string[],
    systemPrompt: string,
    userPrompt: string
  ): Promise<Map<string, ModelResponse>> {
    const promises = modelTypes.map(async (modelType) => {
      try {
        const response = await this.generateResponse(modelType, systemPrompt, userPrompt);
        return [modelType, response] as [string, ModelResponse];
      } catch (error) {
        console.warn(`Parallel generation failed for ${modelType}:`, error);
        return [modelType, {
          content: `Error: ${error instanceof Error ? error.message : String(error)}`,
          processingTime: 0,
          model: modelType,
          confidence: 0
        }] as [string, ModelResponse];
      }
    });

    const results = await Promise.all(promises);
    return new Map(results);
  }

  getAvailableModels(): string[] {
    return Array.from(this.configs.keys());
  }

  updateModelConfig(modelType: string, config: Partial<ModelConfig>): void {
    const existing = this.configs.get(modelType);
    if (existing) {
      this.configs.set(modelType, { ...existing, ...config });
    }
  }

  isModelAvailable(modelType: string): boolean {
    const config = this.configs.get(modelType);
    if (!config) return false;

    return config.provider === 'openai' && !!this.openai;
  }
}