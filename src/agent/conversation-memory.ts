import * as path from 'path';
import * as fs from 'fs-extra';

export interface ConversationTurn {
  id: string;
  timestamp: number;
  userInput: string;
  agentResponse: string;
  command?: string;
  context?: {
    projectState?: any;
    filesModified?: string[];
    confidence?: number;
    todoProgress?: {
      completed: number;
      total: number;
      currentTodo?: string;
    };
  };
}

export interface ConversationSession {
  id: string;
  projectRoot: string;
  startTime: number;
  lastActivity: number;
  turns: ConversationTurn[];
}

export class ConversationMemory {
  private sessionPath: string;
  private currentSession: ConversationSession;

  constructor(projectRoot: string) {
    this.sessionPath = path.join(projectRoot, '.hypercode', 'sessions');
    this.currentSession = this.createNewSession(projectRoot);
  }

  async initialize(): Promise<void> {
    await fs.ensureDir(this.sessionPath);
    
    const existingSession = await this.loadLatestSession();
    if (existingSession && this.isSessionRecent(existingSession)) {
      this.currentSession = existingSession;
    }
  }

  private createNewSession(projectRoot: string): ConversationSession {
    return {
      id: this.generateSessionId(),
      projectRoot,
      startTime: Date.now(),
      lastActivity: Date.now(),
      turns: []
    };
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isSessionRecent(session: ConversationSession): boolean {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    return session.lastActivity > oneHourAgo;
  }

  async addTurn(userInput: string, agentResponse: string, command?: string, context?: any): Promise<void> {
    const turn: ConversationTurn = {
      id: this.generateTurnId(),
      timestamp: Date.now(),
      userInput,
      agentResponse,
      command,
      context
    };

    this.currentSession.turns.push(turn);
    this.currentSession.lastActivity = Date.now();
    
    await this.saveSession();
  }

  private generateTurnId(): string {
    return `turn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  }

  getConversationContext(maxTurns: number = 10): string {
    const recentTurns = this.currentSession.turns.slice(-maxTurns);
    
    if (recentTurns.length === 0) {
      return "This is the start of a new conversation.";
    }

    let context = "Recent conversation history:\n";
    
    for (const turn of recentTurns) {
      // Limit response length to avoid token bloat
      const trimmedResponse = turn.agentResponse.length > 200 
        ? turn.agentResponse.substring(0, 200) + "..."
        : turn.agentResponse;
      
      context += `User: ${turn.userInput}\n`;
      context += `Assistant: ${trimmedResponse}\n`;
      if (turn.command) {
        context += `Executed: ${turn.command}\n`;
      }
      context += "\n";
    }

    return context;
  }

  getProjectState(): any {
    const latestTurn = this.currentSession.turns[this.currentSession.turns.length - 1];
    return latestTurn?.context?.projectState || {};
  }

  async saveSession(): Promise<void> {
    const sessionFile = path.join(this.sessionPath, `${this.currentSession.id}.json`);
    await fs.writeJson(sessionFile, this.currentSession, { spaces: 2 });
  }

  private async loadLatestSession(): Promise<ConversationSession | null> {
    try {
      const files = await fs.readdir(this.sessionPath);
      const sessionFiles = files.filter(f => f.endsWith('.json'));
      
      if (sessionFiles.length === 0) return null;

      sessionFiles.sort((a, b) => {
        const aTime = parseInt(a.split('_')[1]);
        const bTime = parseInt(b.split('_')[1]);
        return bTime - aTime;
      });

      const latestFile = path.join(this.sessionPath, sessionFiles[0]);
      return await fs.readJson(latestFile);
    } catch (error) {
      return null;
    }
  }

  getTurnCount(): number {
    return this.currentSession.turns.length;
  }

  getSessionDuration(): number {
    return Date.now() - this.currentSession.startTime;
  }

  async clearOldSessions(maxAge: number = 7 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const files = await fs.readdir(this.sessionPath);
      const now = Date.now();

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        
        const filePath = path.join(this.sessionPath, file);
        const stats = await fs.stat(filePath);
        
        if (now - stats.mtime.getTime() > maxAge) {
          await fs.remove(filePath);
        }
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }
}