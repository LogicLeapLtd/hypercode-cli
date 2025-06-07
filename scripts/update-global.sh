#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 HyperCode Global Update Script${NC}"
echo "=================================="

# Check if npm is available
if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm is not installed. Please install Node.js and npm first.${NC}"
    exit 1
fi

# Save current directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo -e "${YELLOW}📁 Working in: $PROJECT_ROOT${NC}"
cd "$PROJECT_ROOT"

# Check if package.json exists
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ package.json not found. Are you in the right directory?${NC}"
    exit 1
fi

# Get package name and version
PACKAGE_NAME=$(node -p "require('./package.json').name")
CURRENT_VERSION=$(node -p "require('./package.json').version")

echo -e "${BLUE}📦 Package: $PACKAGE_NAME v$CURRENT_VERSION${NC}"

# Step 1: Clean previous build
echo -e "\n${YELLOW}🧹 Cleaning previous build...${NC}"
rm -rf dist/

# Step 2: Install dependencies
echo -e "\n${YELLOW}📥 Installing dependencies...${NC}"
npm install

# Step 3: Build TypeScript
echo -e "\n${YELLOW}🔨 Building TypeScript...${NC}"
npm run build-only

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Build failed. Please fix TypeScript errors.${NC}"
    exit 1
fi

# Step 4: Check if globally installed
echo -e "\n${YELLOW}🔍 Checking for existing global installation...${NC}"
GLOBAL_VERSION=$(npm list -g --depth=0 $PACKAGE_NAME 2>/dev/null | grep $PACKAGE_NAME | awk -F@ '{print $2}' || echo "")

if [ -n "$GLOBAL_VERSION" ]; then
    echo -e "${BLUE}Found global installation: v$GLOBAL_VERSION${NC}"
    
    # Step 5: Unlink current global version
    echo -e "\n${YELLOW}🔗 Unlinking current global version...${NC}"
    npm unlink -g $PACKAGE_NAME 2>/dev/null || true
else
    echo -e "${BLUE}No existing global installation found${NC}"
fi

# Step 6: Link new version globally
echo -e "\n${YELLOW}🔗 Linking new version globally...${NC}"
npm link

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ Failed to link globally. You may need sudo permissions.${NC}"
    echo -e "${YELLOW}Try running: sudo npm link${NC}"
    exit 1
fi

# Step 7: Verify installation
echo -e "\n${YELLOW}✅ Verifying installation...${NC}"
INSTALLED_VERSION=$(hypercode --version 2>/dev/null || echo "")

if [ -n "$INSTALLED_VERSION" ]; then
    echo -e "${GREEN}✅ Successfully installed HyperCode v$INSTALLED_VERSION${NC}"
    
    # Show where it's installed
    HYPERCODE_PATH=$(which hypercode)
    echo -e "${BLUE}📍 Installed at: $HYPERCODE_PATH${NC}"
    
    # Test the new todo functionality
    echo -e "\n${YELLOW}🧪 Testing new features...${NC}"
    hypercode status
    
    echo -e "\n${GREEN}🎉 HyperCode has been successfully updated!${NC}"
    echo -e "${BLUE}💡 Try the new todo features:${NC}"
    echo "  • hypercode (interactive mode)"
    echo "  • /todo - Show todo list"
    echo "  • /continue - Resume from checkpoint"
    echo "  • /todo add <task> - Add new task"
else
    echo -e "${RED}❌ Installation verification failed${NC}"
    echo -e "${YELLOW}Try running 'hypercode --version' manually${NC}"
    exit 1
fi

echo -e "\n${GREEN}✨ Update complete!${NC}"