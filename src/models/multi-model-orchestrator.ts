import chalk from 'chalk';
import ora from 'ora';
import { ModelClient, ModelResponse } from './model-client';
import { HyperCodeConfig } from '../core/config';
import { ProjectInfo } from '../core/project-detector';
import { CostTracker } from '../utils/cost-tracker';

export interface OrchestrationRequest {
  task: 'build' | 'fix' | 'analyze' | 'validate';
  prompt: string;
  context: {
    projectInfo: ProjectInfo;
    config: HyperCodeConfig;
    files?: string[];
    target?: string;
  };
  options?: {
    debug?: boolean;
    parallel?: boolean;
    fastMode?: boolean;
  };
}

export interface OrchestrationResult {
  primaryResponse: string;
  confidence: number;
  processingTime: number;
  modelResponses: Map<string, ModelResponse>;
  consensus?: {
    agreement: number;
    conflictingPoints: string[];
    recommendation: string;
  };
  debug?: {
    reasoning: string;
    alternatives: string[];
    traces: Map<string, string>;
  };
}

export class MultiModelOrchestrator {
  private modelClient: ModelClient;
  private config: HyperCodeConfig;
  private projectInfo: ProjectInfo;
  private costTracker?: CostTracker;

  constructor(config: HyperCodeConfig, projectInfo: ProjectInfo, costTracker?: CostTracker, apiKey?: string) {
    this.modelClient = new ModelClient(apiKey);
    this.config = config;
    this.projectInfo = projectInfo;
    this.costTracker = costTracker;
  }

  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResult> {
    const spinner = ora('Using gpt-4.1-mini...').start();
    const startTime = Date.now();

    try {
      const systemPrompt = this.buildSystemPrompt(request);
      
      // Use only gpt-4.1-mini (speed model)
      const response = await this.modelClient.generateResponse('speed', systemPrompt, request.prompt);
      
      const responses = new Map<string, ModelResponse>();
      responses.set('speed', response);

      const result: OrchestrationResult = {
        primaryResponse: response.content,
        confidence: response.confidence || 0.9,
        processingTime: Date.now() - startTime,
        modelResponses: responses
      };

      if (request.options?.debug) {
        result.debug = {
          reasoning: `Single model (gpt-4.1-mini) response with ${Math.round((response.confidence || 0.9) * 100)}% confidence`,
          alternatives: [],
          traces: new Map([['speed', response.content]])
        };
      }

      spinner.succeed(`Generated in ${result.processingTime}ms with gpt-4.1-mini`);
      
      return result;

    } catch (error) {
      spinner.fail('Generation failed');
      throw error;
    }
  }

  private buildSystemPrompt(request: OrchestrationRequest): string {
    if (request.task === 'build') {
      return `You are a ${this.projectInfo.language} developer. When asked to create or build features, you MUST generate complete, working code files.

CRITICAL REQUIREMENTS:
1. ALWAYS output actual code files, never just explanations or plans
2. Use EXACTLY this format for each file:

\`\`\`typescript
// package.json
{
  "name": "my-react-app",
  "version": "0.1.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "scripts": {
    "start": "react-scripts start"
  }
}
\`\`\`

\`\`\`typescript
// src/App.tsx
import React from 'react';

function App() {
  return <div>Hello World</div>;
}

export default App;
\`\`\`

3. For React apps, generate at minimum: package.json, src/App.tsx, src/index.tsx, public/index.html
4. Make sure every file has a comment with the file path at the top
5. DO NOT just describe what to do - actually output the complete file contents

If you cannot generate actual files for the request, respond with: "COMMAND_REQUIRED: npx create-react-app my-app"`;
    }
    
    // Minimal for other tasks
    return `You are a ${this.projectInfo.language} developer. Generate clean, working code. Be concise.`;
  }

  private selectModels(request: OrchestrationRequest): string[] {
    const availableModels = this.modelClient.getAvailableModels().filter(
      model => this.modelClient.isModelAvailable(model)
    );

    if (availableModels.length === 0) {
      throw new Error('No AI models available. Please configure API keys.');
    }

    if (request.options?.fastMode) {
      return availableModels.includes('speed') ? ['speed'] : [availableModels[0]];
    }

    switch (request.task) {
      case 'build':
        return availableModels.filter(m => ['speed', 'quality', 'reasoning'].includes(m));
      case 'fix':
        return availableModels.filter(m => ['quality', 'reasoning', 'validation'].includes(m));
      case 'analyze':
        return availableModels.filter(m => ['reasoning', 'quality'].includes(m));
      case 'validate':
        return availableModels.filter(m => ['validation', 'speed'].includes(m));
      default:
        return availableModels.slice(0, 2); // Use first 2 available models
    }
  }

  private async runSequential(
    modelTypes: string[],
    systemPrompt: string,
    userPrompt: string
  ): Promise<Map<string, ModelResponse>> {
    const responses = new Map<string, ModelResponse>();

    for (const modelType of modelTypes) {
      try {
        const response = await this.modelClient.generateResponse(modelType, systemPrompt, userPrompt);
        responses.set(modelType, response);
      } catch (error) {
        console.warn(`Sequential model ${modelType} failed:`, error);
      }
    }

    return responses;
  }

  private buildConsensus(responses: Map<string, ModelResponse>): {
    agreement: number;
    conflictingPoints: string[];
    recommendation: string;
  } {
    const responseArray = Array.from(responses.values());
    
    if (responseArray.length === 0) {
      return {
        agreement: 0,
        conflictingPoints: ['No responses available'],
        recommendation: 'Unable to generate consensus'
      };
    }

    if (responseArray.length === 1) {
      return {
        agreement: responseArray[0].confidence || 0.8,
        conflictingPoints: [],
        recommendation: 'Single model response'
      };
    }

    // Simple consensus algorithm
    const avgConfidence = responseArray.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / responseArray.length;
    const contentLengthVariance = this.calculateContentLengthVariance(responseArray);
    
    let agreement = avgConfidence;
    
    // Reduce agreement if responses vary significantly in length
    if (contentLengthVariance > 0.5) {
      agreement *= 0.8;
    }

    const conflictingPoints: string[] = [];
    if (contentLengthVariance > 0.5) {
      conflictingPoints.push('Significant variance in response lengths');
    }
    if (avgConfidence < 0.7) {
      conflictingPoints.push('Low average confidence across models');
    }

    const recommendation = agreement > 0.8 
      ? 'High consensus - safe to proceed'
      : agreement > 0.6
      ? 'Moderate consensus - review recommended'
      : 'Low consensus - manual review required';

    return { agreement, conflictingPoints, recommendation };
  }

  private calculateContentLengthVariance(responses: ModelResponse[]): number {
    if (responses.length < 2) return 0;

    const lengths = responses.map(r => r.content.length);
    const mean = lengths.reduce((sum, len) => sum + len, 0) / lengths.length;
    const variance = lengths.reduce((sum, len) => sum + Math.pow(len - mean, 2), 0) / lengths.length;
    
    return Math.sqrt(variance) / mean; // Coefficient of variation
  }

  private selectPrimaryResponse(
    responses: Map<string, ModelResponse>,
    consensus: { agreement: number }
  ): string {
    const responseArray = Array.from(responses.entries());
    
    if (responseArray.length === 0) {
      return 'No response generated.';
    }

    // Prefer quality model, then highest confidence, then shortest processing time
    const priorityOrder = ['quality', 'reasoning', 'speed', 'validation'];
    
    for (const priority of priorityOrder) {
      const found = responseArray.find(([type]) => type === priority);
      if (found) {
        return found[1].content;
      }
    }

    // Fallback to highest confidence
    const sorted = responseArray.sort((a, b) => (b[1].confidence || 0) - (a[1].confidence || 0));
    return sorted[0][1].content;
  }

  private calculateOverallConfidence(
    responses: Map<string, ModelResponse>,
    consensus: { agreement: number }
  ): number {
    const responseArray = Array.from(responses.values());
    
    if (responseArray.length === 0) return 0;

    const avgModelConfidence = responseArray.reduce((sum, r) => sum + (r.confidence || 0.5), 0) / responseArray.length;
    
    // Combine model confidence with consensus agreement
    return (avgModelConfidence + consensus.agreement) / 2;
  }

  private buildDebugInfo(
    responses: Map<string, ModelResponse>,
    consensus: { agreement: number; conflictingPoints: string[]; recommendation: string }
  ): {
    reasoning: string;
    alternatives: string[];
    traces: Map<string, string>;
  } {
    const reasoning = `Consensus Analysis:
- Agreement Score: ${Math.round(consensus.agreement * 100)}%
- Recommendation: ${consensus.recommendation}
- Conflicts: ${consensus.conflictingPoints.join(', ') || 'None'}

Model Performance:
${Array.from(responses.entries()).map(([type, response]) => 
  `- ${type}: ${response.processingTime}ms, ${Math.round((response.confidence || 0) * 100)}% confidence`
).join('\\n')}`;

    const alternatives = Array.from(responses.values())
      .filter(r => r.content.length > 50)
      .map(r => r.content)
      .slice(1, 4); // Up to 3 alternatives

    const traces = new Map<string, string>();
    for (const [type, response] of responses.entries()) {
      traces.set(type, `Model: ${response.model}\\nTime: ${response.processingTime}ms\\nConfidence: ${Math.round((response.confidence || 0) * 100)}%`);
    }

    return { reasoning, alternatives, traces };
  }
}