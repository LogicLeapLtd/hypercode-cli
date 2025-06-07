# HyperCode CLI

Lightning-fast CLI coding agent for generating complete applications and features at unprecedented speed.

## Current Status: Phase 1D Complete ✅ - File Generation Engine + Git Integration

### 🚀 Phase 1D Complete: File Generation Engine + Git Integration

#### 🔧 Advanced File Generation
- **Step-by-Step Approval**: Interactive review of each file operation
- **Auto-Mode Toggle**: Batch processing with Shift+Tab or `/auto` command
- **Colored Diff Output**: Visual file changes with syntax highlighting
- **Safe File Operations**: Project boundary enforcement and backup creation
- **Smart Content Parsing**: Automatic file extraction from AI responses

#### 🌿 Complete Git Integration
- **Git Commands**: `/git-status`, `/git-setup`, `/git-push`, `/git-branch`, `/git-commit`, `/git`
- **Auto-Commit**: Optional automatic commits after file generation
- **Feature Branches**: Create dedicated branches for each feature
- **Branch Strategy**: Work in current branch or create feature branches
- **Push Integration**: Automatic or manual push to remote repositories

#### 🎨 Enhanced User Experience
- **Interactive File Approval**: Preview, edit, skip, or auto-approve files
- **Generation Plans**: See exactly what will be created before proceeding
- **Git Strategy Display**: Branch creation and commit information
- **Completion Summaries**: Detailed reports of files created/modified/skipped

### 🎯 Phase 1C Complete: Professional UX Enhancements

#### 💰 Real-Time Cost Management
- **Token Usage Tracking**: Accurate per-model input/output token counting
- **Live Cost Display**: Running session total in prompt: `💰 $2.34 >`
- **Cost Warnings**: Alert before expensive operations (>$5.00)
- **Session Summaries**: Detailed breakdown at exit with per-model costs
- **Daily Spending Caps**: Configurable limits to prevent overspending

#### 🎨 Enhanced Interface
- **Colored Diff Output**: File changes with syntax highlighting (+ green, - red)
- **Structured Task Lists**: Completed ✅ / Next Steps 📋 / Suggestions 💡
- **Command Autocomplete**: `/` trigger with real-time filtering and arrow navigation
- **Progress Indicators**: Per-model status with live timing
- **Safe Exit**: Double ESC with confirmation and cost summary

#### 🔧 Terminal Enhancements
- **Preserved Scroll Position**: Clean suggestion overlays
- **Auto-scroll Management**: Keep user input visible
- **Buffer Management**: No UI conflicts with chat history
- **Immediate API Termination**: Clean shutdown on exit

### ✨ Phase 1B Complete: Interactive Agent + Multi-Model System

#### 🤖 Interactive Conversational Agent
- **Dual Mode Support**: Traditional commands + interactive agent mode
- **Natural Language Processing**: "add user authentication" vs "hypercode build auth"
- **Conversation Memory**: Context persistence across interactions
- **Intelligent Command Routing**: GPT-4 powered intent recognition

#### ⚡ Multi-Model Orchestration
- **Parallel Processing**: OpenAI, Anthropic, DeepSeek integration
- **Speed Tier**: GPT-4 Turbo for rapid generation (2-4 seconds)
- **Quality Tier**: Claude-3 Opus for premium code quality
- **Reasoning Tier**: DeepSeek for complex logic and mathematical reasoning
- **Validation Tier**: Automated code validation and error checking
- **Consensus Building**: Multi-model agreement scoring and conflict resolution

#### 🧠 Advanced Features
- **Real-time Confidence Scoring**: See certainty levels for each generation
- **Alternative Solutions**: Multiple implementation approaches
- **Debug Mode**: Model reasoning traces and performance analytics
- **Session Persistence**: Conversation history and context management

### Core Foundation Features

#### 🏗️ CLI Foundation
- **Dual Mode Architecture**: `hypercode` (interactive) or `hypercode <command>` (traditional)
- **Command Structure**: Full CLI with commander.js
- **TypeScript Setup**: Strict typing with modern ES2022 target
- **Error Handling**: Comprehensive error catching and user-friendly messages

#### 🔒 Directory Safety & Security
- **Project Boundary Detection**: Auto-detects project root via `.git`, `package.json`, etc.
- **Path Validation**: Prevents access to files outside project directory
- **Safe File Listing**: Respects `.hypercodeignore` and standard ignore patterns
- **Relative Path Handling**: Proper macOS path handling with spaces

#### 🔍 Project Intelligence
- **Auto-Detection**: Supports Node.js, Python, Rust, Go projects
- **Framework Recognition**: React, Next.js, Vue, Express, Django, FastAPI, etc.
- **Code Style Analysis**: Detects indentation, semicolons, quotes from existing config
- **Tech Stack Identification**: Automatically catalogs dependencies and tools

#### ⚙️ Configuration System
- **`.hypercode.json`**: Project-specific configuration
- **Smart Defaults**: Language-appropriate exclude patterns and settings
- **macOS Integration**: Editor, diff tool, and terminal preferences
- **Model Configuration**: Configurable AI model selection per tier

## Usage Modes

### 🤖 Interactive Agent Mode (Recommended)

```bash
# Start interactive agent
hypercode
# or explicitly
hypercode agent

# Then chat naturally:
hypercode> add user authentication with JWT
hypercode> fix the login bug in auth.ts  
hypercode> show me the project status
hypercode> what files are in scope?
```

### 📟 Traditional Command Mode

```bash
# Initialize project
hypercode init [project-type]

# Show current status  
hypercode status

# View files in scope
hypercode scope

# Generate features (⚡ Now fully functional!)
hypercode build "user authentication system"
hypercode build "shopping cart component" --debug

# Fix issues (⚡ Now fully functional!)
hypercode fix "TypeError in login.ts"
hypercode fix auth.ts

# Debug mode with detailed traces
hypercode debug --trace --confidence --alternatives

# Git commands
hypercode git-status
hypercode git-setup
hypercode git-push
hypercode git-branch
hypercode git-commit
hypercode git
```

## 🚀 Installation & Quick Start

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/hypercode-cli.git
cd hypercode-cli

# Install dependencies
npm install

# Build the CLI
npm run build

# Link globally (makes 'hypercode' command available)
npm link
```

### Quick Start

```bash
# 1. Initialize in any project
cd my-project
hypercode init

# 2. Set up API keys (create a .env file in the root directory)
# There is currently NO .env.example file. Create .env manually with the following keys:

OPENAI_API_KEY=sk-...        # For GPT models (speed + validation)
ANTHROPIC_API_KEY=sk-ant-... # For Claude models (quality)  
DEEPSEEK_API_KEY=...         # For DeepSeek models (reasoning)

# 3. Start building!
hypercode                    # Interactive agent mode
hypercode build "auth system" # Direct command mode
```

### Verify Installation

```bash
hypercode --version          # Should show: 0.1.0
hypercode --help            # Show all available commands
hypercode status            # Show project status
```

### Project Detection Examples

**Node.js/React Project:**
```json
{
  "type": "react-typescript",
  "language": "typescript",
  "framework": "react",
  "techStack": ["React", "TypeScript", "Tailwind CSS"],
  "codeStyle": {
    "indent": "2 spaces",
    "semicolons": false,
    "quotes": "single"
  }
}
```

**Python FastAPI Project:**
```json
{
  "type": "python",
  "language": "python", 
  "techStack": ["Python", "FastAPI"],
  "codeStyle": {
    "indent": "4 spaces",
    "semicolons": false,
    "quotes": "single"
  }
}
```

## Development

```bash
# Install dependencies
npm install

# Build
yarn build # or npm run build

# Development mode
npm run dev -- <command>

# Run built version
npm start <command>

# Lint and typecheck
npm run lint
npm run typecheck
```

- **Test folder:** See `test-folder/` for example/test scripts.
- **Update script:** Use `scripts/update-global.sh` to update the global CLI link.

## Architecture

```
src/
├── index.ts                    # Dual-mode CLI entry point
├── core/
│   ├── directory-safety.ts       # Project boundary enforcement
│   ├── project-detector.ts       # Auto-detection logic
│   ├── config.ts                # Configuration management
│   ├── file-generator.ts        # File generation engine
│   ├── git-manager.ts           # Git integration logic
│   ├── checkpoint-manager.ts    # File operation checkpoints
│   └── todo-manager.ts          # TODO/task management
├── agent/
│   ├── interactive-agent.ts      # Conversational REPL interface
│   ├── command-router.ts         # Intelligent intent recognition
│   └── conversation-memory.ts    # Session persistence
├── models/
│   ├── model-client.ts           # Multi-provider API client
│   └── multi-model-orchestrator.ts # Parallel processing engine
├── commands/
│   ├── init.ts                   # Project initialization
│   ├── status.ts                 # Project status display
│   ├── scope.ts                  # File scope analysis
│   ├── build.ts                  # Feature generation
│   ├── fix.ts                    # Issue fixing
│   ├── debug.ts                  # Debug tooling
│   └── git.ts                    # Git commands
└── utils/
    ├── approval-manager.ts       # File approval and review
    ├── command-autocomplete.ts   # Autocomplete logic
    ├── api-key-manager.ts        # API key management
    ├── command-executor.ts       # Command execution helpers
    └── cost-tracker.ts           # Cost tracking and analytics
```

## Configuration

- **.hypercode.json**: Project-specific configuration (see example in repo)
- **tsconfig.json**: TypeScript configuration (ES2022, strict mode)
- **package.json**: Scripts, dependencies, CLI entry, and engines

## API Keys Setup

HyperCode requires at least one AI provider API key. The system will automatically use available models. Place your keys in a `.env` file in the project root (no .env.example is provided by default):

```
OPENAI_API_KEY=sk-...        # For GPT models (speed + validation)
ANTHROPIC_API_KEY=sk-ant-... # For Claude models (quality)
DEEPSEEK_API_KEY=...         # For DeepSeek models (reasoning)
```

### Model Tiers & Current Pricing (Dec 2024)

| Tier        | Provider   | Model           | Cost per 1M Tokens | Use Case                        |
|-------------|------------|-----------------|--------------------|---------------------------------|
| **Speed**   | OpenAI     | GPT-4 Turbo     | $10/$30 (in/out)   | Rapid prototyping, validation   |
| **Quality** | Anthropic  | Claude-3 Opus   | $15/$75 (in/out)   | Premium code quality            |
| **Reasoning**| DeepSeek  | DeepSeek-Coder  | $0.14/$0.28 (in/out)| Complex logic, math             |
| **Validation**| OpenAI   | GPT-4 Turbo     | $10/$30 (in/out)   | Code review, testing            |

### 💰 Cost Management Features

- **Real-time tracking**: Accurate per-token cost calculation
- **Session summaries**: Detailed breakdown by model and request
- **Daily spending caps**: Configurable limits (default $50/day)
- **Cost warnings**: Alerts before expensive operations (>$5)
- **Historical data**: 30-day cost history and analytics

## 🎉 All Core Features Complete! Ready for Production

### ✅ Complete Feature Set
- **🔧 File Generation Engine**: Intelligent code creation with step-by-step approval
- **🌿 Git Integration**: Full workflow automation with branch management
- **💰 Cost Management**: Real-time tracking with spending protection
- **🎯 Command Autocomplete**: Professional CLI experience with "/" trigger
- **🤖 Multi-Model AI**: Multi-model orchestration with consensus building
- **🛡️ Safety Systems**: Project boundary enforcement and safe exit
- **🎨 Enhanced UX**: Colored diffs, progress indicators, and summaries

### 🚀 What's Next: Advanced Features

Future enhancements:
- 🧪 **Test Generation**: Comprehensive test suites for generated features
- 📋 **Structured Task Lists**: Completed ✅ / Next Steps 📋 / Suggestions 💡
- 🔄 **Advanced Git**: PR creation, conflict resolution, and merge strategies
- 📊 **Analytics Dashboard**: Usage patterns and productivity metrics
- 🎮 **Plugin System**: Extensible architecture for custom workflows

## Safety Guarantees

✅ **Never accesses files outside current project**  
✅ **Respects .hypercodeignore patterns**  
✅ **Validates all file operations**  
✅ **Project-scoped operations only**  
✅ **No symlink following outside boundary**

---

*Built with TypeScript, Commander.js, and a focus on developer safety and productivity.*