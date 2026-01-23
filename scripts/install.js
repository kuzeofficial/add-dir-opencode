import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMMAND_SOURCE = path.join(__dirname, '..', 'command', 'add-dir.md');
const COMMAND_DEST = path.join(__dirname, '..', '..', '..', 'command', 'add-dir.md');

try {
  const commandDir = path.dirname(COMMAND_DEST);

  if (!fs.existsSync(commandDir)) {
    fs.mkdirSync(commandDir, { recursive: true });
  }

  if (fs.existsSync(COMMAND_SOURCE)) {
    fs.copyFileSync(COMMAND_SOURCE, COMMAND_DEST);
    console.log('✓ opencode-add-dir: Command file installed successfully');
  }
} catch (error) {
  console.error('✗ opencode-add-dir: Failed to install command file:', error.message);
  process.exit(1);
}
