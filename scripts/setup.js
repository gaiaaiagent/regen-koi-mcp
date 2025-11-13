#!/usr/bin/env node
/**
 * Automated setup script for Regen KOI MCP Server
 * Configures the MCP server for various clients automatically
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Detect OS
const platform = os.platform();
const homeDir = os.homedir();

// Configuration paths for different platforms
const CONFIG_PATHS = {
  darwin: path.join(homeDir, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'),
  win32: path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json'),
  linux: path.join(homeDir, '.config', 'Claude', 'claude_desktop_config.json')
};

const VSCode_CONFIG_PATHS = {
  darwin: path.join(homeDir, 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
  win32: path.join(process.env.APPDATA || '', 'Code', 'User', 'settings.json'),
  linux: path.join(homeDir, '.config', 'Code', 'User', 'settings.json')
};

console.log('🚀 Regen KOI MCP Server Setup\n');

// Function to detect installed MCP clients
function detectClients() {
  const clients = [];

  // Check for Claude Desktop
  const claudeConfigPath = CONFIG_PATHS[platform];
  if (claudeConfigPath && fs.existsSync(path.dirname(claudeConfigPath))) {
    clients.push('claude');
  }

  // Check for Claude Code CLI
  try {
    execSync('claude --version', { stdio: 'ignore' });
    clients.push('claude-code');
  } catch (e) {
    // Claude Code CLI not found
  }

  // Check for VSCode (for Cline/Continue extensions)
  const vscodeConfigPath = VSCode_CONFIG_PATHS[platform];
  if (vscodeConfigPath && fs.existsSync(path.dirname(vscodeConfigPath))) {
    // Check for specific extensions
    try {
      if (platform === 'darwin' || platform === 'linux') {
        execSync('code --list-extensions | grep -E "saoudrizwan.claude-dev|continue.continue" > /dev/null 2>&1', { stdio: 'ignore' });
        clients.push('vscode');
      } else if (platform === 'win32') {
        execSync('code --list-extensions | findstr /R "saoudrizwan.claude-dev continue.continue" > nul 2>&1', { stdio: 'ignore' });
        clients.push('vscode');
      }
    } catch (e) {
      // Extensions not found
    }
  }

  return clients;
}

// Function to setup Claude Desktop
function setupClaude() {
  console.log('📱 Setting up Claude Desktop...');

  const configPath = CONFIG_PATHS[platform];
  if (!configPath) {
    console.log('❌ Unsupported platform for Claude Desktop');
    return;
  }

  // Create directory if it doesn't exist
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  // Read existing config or create new one
  let config = {};
  if (fs.existsSync(configPath)) {
    try {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.log('⚠️  Existing config is invalid, creating new one');
    }
  }

  // Initialize mcpServers if not exists
  if (!config.mcpServers) {
    config.mcpServers = {};
  }

  // Add regen-koi server
  config.mcpServers['regen-koi'] = {
    command: 'node',
    args: [path.join(projectRoot, 'dist', 'index.js')],
    env: {
      // Prefer the public HTTPS endpoint exposed via Nginx
      KOI_API_ENDPOINT: process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi'
    }
  };

  // Write config
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  console.log(`✅ Claude Desktop configured at: ${configPath}`);
  console.log('   Please restart Claude Desktop to see the changes\n');
}

// Function to setup Claude Code CLI
function setupClaudeCode() {
  console.log('🔧 Setting up Claude Code CLI...');

  try {
    const serverConfig = JSON.stringify({
      command: 'node',
      args: [path.join(projectRoot, 'dist', 'index.js')],
      env: {
        KOI_API_ENDPOINT: process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi'
      }
    });

    try {
      // Attempt to add, will fail if already exists
      execSync(`claude mcp add-json regen-koi '${serverConfig}'`, {
        stdio: 'inherit',
        shell: true
      });
      console.log('✅ Claude Code CLI configured successfully');
      console.log('   Please restart Claude Code to see the changes\n');
    } catch (addErr) {
      // If already exists or other non-fatal error, try remove then add
      try {
        console.log('ℹ️  Updating existing Claude Code MCP config for regen-koi...');
        execSync(`claude mcp remove regen-koi`, { stdio: 'ignore', shell: true });
      } catch (_) {
        // ignore remove failure (may not exist)
      }
      execSync(`claude mcp add-json regen-koi '${serverConfig}'`, {
        stdio: 'inherit',
        shell: true
      });
      console.log('✅ Claude Code CLI configuration updated');
      console.log('   Please restart Claude Code to see the changes\n');
    }
  } catch (e) {
    console.error('❌ Failed to configure Claude Code CLI:', e.message);
  }
}

// Function to setup VSCode extensions (Cline/Continue)
function setupVSCode() {
  console.log('📝 Setting up VSCode MCP extensions...');

  const configPath = VSCode_CONFIG_PATHS[platform];
  if (!configPath) {
    console.log('❌ Unsupported platform for VSCode');
    return;
  }

  // Read existing settings
  let settings = {};
  if (fs.existsSync(configPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch (e) {
      console.log('⚠️  Existing settings invalid, creating new ones');
    }
  }

  // Setup for Cline (Claude Dev)
  if (!settings['claude-dev.mcpServers']) {
    settings['claude-dev.mcpServers'] = {};
  }
  settings['claude-dev.mcpServers']['regen-koi'] = {
    command: 'node',
    args: [path.join(projectRoot, 'dist', 'index.js')],
    env: {
      KOI_API_ENDPOINT: process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi'
    }
  };

  // Setup for Continue
  if (!settings['continue.mcpServers']) {
    settings['continue.mcpServers'] = {};
  }
  settings['continue.mcpServers']['regen-koi'] = {
    command: 'node',
    args: [path.join(projectRoot, 'dist', 'index.js')],
    env: {
      KOI_API_ENDPOINT: process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi'
    }
  };

  // Write settings
  fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
  console.log(`✅ VSCode MCP extensions configured at: ${configPath}`);
  console.log('   Please reload VSCode window to see the changes\n');
}

// Function to build the project
function buildProject() {
  console.log('🔨 Building project...');
  try {
    execSync('npm run build', { cwd: projectRoot, stdio: 'inherit' });
    console.log('✅ Project built successfully\n');
  } catch (e) {
    console.error('❌ Build failed. Please run "npm install" first');
    process.exit(1);
  }
}

// Function to check if KOI API is running
function checkKOIAPI() {
  console.log('🔍 Checking KOI API connection...');
  const endpoint = process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi';

  try {
    // Try to fetch stats endpoint
    execSync(`curl -s ${endpoint}/stats > /dev/null 2>&1`, { timeout: 5000 });
    console.log(`✅ KOI API is accessible at: ${endpoint}\n`);
    return true;
  } catch (e) {
    console.log(`⚠️  KOI API not accessible at: ${endpoint}`);
    console.log('   This is normal if you\'re setting up locally.\n');
    console.log('   The remote server will be used when you run the MCP tools.\n');
    return false;
  }
}

// Main setup function
async function main() {
  console.log(`Platform: ${platform}`);
  console.log(`Home Directory: ${homeDir}\n`);

  // Check if .env exists, if not create from template
  const envPath = path.join(projectRoot, '.env');
  if (!fs.existsSync(envPath)) {
    console.log('📋 Creating .env file...');
    const envContent = `# Regen KOI MCP Configuration
# Connect to the public Regen KOI server (via HTTPS)
KOI_API_ENDPOINT=https://regen.gaiaai.xyz/api/koi
# Optional: Add your KOI API key if required
# KOI_API_KEY=your_api_key_here
`;
    fs.writeFileSync(envPath, envContent);
    console.log('✅ Created .env file\n');
  }

  // Load .env
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^#][^=]+)=(.+)$/);
      if (match) {
        process.env[match[1].trim()] = match[2].trim();
      }
    });
  }

  // Build the project
  buildProject();

  // Check KOI API
  const koiAvailable = checkKOIAPI();

  // Detect installed clients
  const clients = detectClients();
  console.log('🔎 Detected MCP clients:', clients.length > 0 ? clients.join(', ') : 'none');
  console.log();

  // Setup each detected client
  if (clients.includes('claude')) {
    setupClaude();
  }

  if (clients.includes('claude-code')) {
    setupClaudeCode();
  }

  if (clients.includes('vscode')) {
    setupVSCode();
  }

  if (clients.length === 0) {
    console.log('📋 No MCP clients detected. Manual setup required.\n');
    console.log('For Claude Desktop, add this to your claude_desktop_config.json:\n');
    console.log(JSON.stringify({
      mcpServers: {
        'regen-koi': {
          command: 'node',
          args: [path.join(projectRoot, 'dist', 'index.js')],
          env: {
            KOI_API_ENDPOINT: process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi'
          }
        }
      }
    }, null, 2));
    console.log('\nFor Claude Code CLI, run:\n');
    console.log(`claude mcp add-json regen-koi '${JSON.stringify({
      command: 'node',
      args: [path.join(projectRoot, 'dist', 'index.js')],
      env: {
        KOI_API_ENDPOINT: process.env.KOI_API_ENDPOINT || 'https://regen.gaiaai.xyz/api/koi'
      }
    })}'`);
  }

  console.log('\n✨ Setup complete!');

  if (!koiAvailable) {
    console.log('\n⚠️  Remember to start your KOI API server before using the MCP tools');
  }

  console.log('\n📚 Available MCP Tools:');
  try {
    const mod = await import(path.join(projectRoot, 'dist', 'tools.js'));
    const tools = (mod.TOOLS || []).map((t) => ({ name: t.name, description: t.description }));
    if (tools.length === 0) throw new Error('No tools exported');
    tools.forEach(t => console.log(`   - ${t.name}: ${t.description}`));
  } catch (e) {
    // Fallback if dist/tools.js not found
    console.log('   - search_knowledge: Hybrid search across KOI (vectors + graph)');
    console.log('   - get_stats: Knowledge base statistics');
  }
  console.log('\nEnjoy using Regen KOI MCP! 🌱');
}

// Run setup
main().catch(console.error);
