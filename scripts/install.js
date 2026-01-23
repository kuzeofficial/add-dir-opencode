import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMAND_SOURCE = path.join(__dirname, '..', 'command', 'add-dir.md');

function findOpencodeConfigDir(startDir = process.cwd()) {
  const configFiles = ['opencode.jsonc', 'opencode.json'];
  let currentDir = startDir;

  while (currentDir !== path.parse(currentDir).root) {
    for (const configFile of configFiles) {
      const configPath = path.join(currentDir, configFile);
      if (fs.existsSync(configPath)) {
        return currentDir;
      }
    }
    currentDir = path.dirname(currentDir);
  }

  const defaultConfigDir = path.join(os.homedir(), '.config', 'opencode');
  if (fs.existsSync(defaultConfigDir)) {
    return defaultConfigDir;
  }

  return null;
}

try {
  const opencodeDir = findOpencodeConfigDir();

  if (!opencodeDir) {
    console.log('ℹ opencode-add-dir: Could not find opencode config directory, skipping command file installation');
    process.exit(0);
  }

  const commandDir = path.join(opencodeDir, 'command');
  const commandDest = path.join(commandDir, 'add-dir.md');

  if (!fs.existsSync(commandDir)) {
    fs.mkdirSync(commandDir, { recursive: true });
  }

  if (fs.existsSync(COMMAND_SOURCE)) {
    fs.copyFileSync(COMMAND_SOURCE, commandDest);
    console.log('✓ opencode-add-dir: Command file installed to', commandDest);
  } else {
    console.error('✗ opencode-add-dir: Command source file not found at', COMMAND_SOURCE);
    process.exit(1);
  }
} catch (error) {
  console.error('✗ opencode-add-dir: Failed to install command file:', error.message);
  process.exit(1);
}
