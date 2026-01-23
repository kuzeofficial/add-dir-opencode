import { tool } from '@opencode-ai/plugin/tool';
import type { Plugin } from '@opencode-ai/plugin';
import type { Permission } from '@opencode-ai/sdk';
import fs from 'fs';
import path from 'path';

const IGNORED_DIRECTORIES = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '__pycache__',
  '.venv',
  'venv',
  'env',
  '.env',
  'coverage',
  '.nuxt',
  '.output',
  'tmp',
  'temp',
  '.turbo'
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.svg', '.webp',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.zip', '.tar', '.gz', '.rar', '.7z',
  '.mp3', '.mp4', '.avi', '.mov', '.wav',
  '.exe', '.dll', '.so', '.dylib', '.bin',
  '.class', '.jar', '.war',
  '.pyc', '.pyo',
  '.db', '.sqlite', '.sqlite3',
  '.lock', '.log'
]);

const MAX_FILE_SIZE_BYTES = 100 * 1024;
const MAX_FILES = 500;

interface FileInfo {
  path: string;
  size: number;
  content?: string;
  isTruncated: boolean;
}

interface DirectoryScanResult {
  directory: string;
  totalFilesFound: number;
  filesProcessed: number;
  filesSkipped: number;
  filesTooLarge: number;
  tree: string[];
  files: FileInfo[];
}

interface AddedDirectories {
  directories: string[];
}

const ADDED_DIRS_FILE = path.join(__dirname, '.added-dirs.json');

function getAddedDirectories(): Set<string> {
  try {
    if (fs.existsSync(ADDED_DIRS_FILE)) {
      const content = fs.readFileSync(ADDED_DIRS_FILE, 'utf-8');
      const data: AddedDirectories = JSON.parse(content);
      return new Set(data.directories);
    }
  } catch (error) {
    console.error('Failed to read added directories:', error);
  }
  return new Set();
}

function saveAddedDirectory(dirPath: string): void {
  const added = getAddedDirectories();
  const normalizedPath = path.resolve(dirPath);

  if (!added.has(normalizedPath)) {
    added.add(normalizedPath);
    const data: AddedDirectories = { directories: Array.from(added) };
    fs.writeFileSync(ADDED_DIRS_FILE, JSON.stringify(data, null, 2));
  }
}

function isPathInAddedDirectories(requestedPath: string): boolean {
  const addedDirs = getAddedDirectories();
  const normalizedPath = path.resolve(requestedPath);

  for (const dir of addedDirs) {
    const relative = path.relative(dir, normalizedPath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return true;
    }
  }

  return false;
}

function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return BINARY_EXTENSIONS.has(ext);
}

function shouldIgnoreDirectory(dirName: string): boolean {
  return IGNORED_DIRECTORIES.has(dirName);
}

function scanDirectory(
  dirPath: string,
  baseDir: string,
  files: FileInfo[] = [],
  tree: string[] = [],
  depth: number = 0,
  fileCount: number = 0
): { files: FileInfo[], tree: string[], fileCount: number, skipped: number } {
  if (fileCount >= MAX_FILES) {
    return { files, tree, fileCount, skipped: 0 };
  }

  let skipped = 0;
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  const sortedEntries = entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  for (const entry of sortedEntries) {
    if (fileCount >= MAX_FILES) {
      break;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    const indent = '  '.repeat(depth);

    if (entry.isDirectory()) {
      if (shouldIgnoreDirectory(entry.name)) {
        skipped++;
        continue;
      }

      tree.push(`${indent}${entry.name}/`);
      const result = scanDirectory(
        fullPath,
        baseDir,
        files,
        tree,
        depth + 1,
        fileCount
      );
      files = result.files;
      tree = result.tree;
      fileCount = result.fileCount;
      skipped += result.skipped;
    } else if (entry.isFile()) {
      if (isBinaryFile(entry.name)) {
        skipped++;
        continue;
      }

      const stats = fs.statSync(fullPath);

      if (stats.size > MAX_FILE_SIZE_BYTES) {
        skipped++;
        continue;
      }

      tree.push(`${indent}${entry.name}`);

      let content: string | undefined;
      let isTruncated = false;

      try {
        content = fs.readFileSync(fullPath, 'utf-8');

        if (content.length > MAX_FILE_SIZE_BYTES) {
          content = content.slice(0, MAX_FILE_SIZE_BYTES);
          isTruncated = true;
        }
      } catch (error) {
        content = undefined;
      }

      files.push({
        path: relativePath,
        size: stats.size,
        content,
        isTruncated
      });

      fileCount++;
    }
  }

  return { files, tree, fileCount, skipped };
}

const addDirPlugin: Plugin = async () => {
  return {
    tool: {
      add_dir: tool({
        description: 'Add an external directory to the session context by reading all its files',
        args: {
          directory: tool.schema.string().describe('Path to the directory to add')
        },
        execute: async ({ directory }) => {
          const resolvedPath = path.resolve(directory);

          if (!fs.existsSync(resolvedPath)) {
            throw new Error(`Directory does not exist: ${resolvedPath}`);
          }

          if (!fs.statSync(resolvedPath).isDirectory()) {
            throw new Error(`Path is not a directory: ${resolvedPath}`);
          }

          try {
            fs.accessSync(resolvedPath, fs.constants.R_OK);
          } catch (error) {
            throw new Error(`Permission denied: Cannot read directory ${resolvedPath}`);
          }

          const scanResult = scanDirectory(resolvedPath, resolvedPath);
          const totalFound = scanResult.fileCount + scanResult.skipped;
          const filesTooLarge = scanResult.skipped;

          const output: DirectoryScanResult = {
            directory: resolvedPath,
            totalFilesFound: totalFound,
            filesProcessed: scanResult.fileCount,
            filesSkipped: scanResult.skipped - filesTooLarge,
            filesTooLarge,
            tree: scanResult.tree,
            files: scanResult.files
          };

          saveAddedDirectory(resolvedPath);

          return JSON.stringify({
            ...output,
            message: 'Directory added to context. Future access to this directory will not require permission prompts.'
          }, null, 2);
        }
      })
    },
    'permission.ask': async (input: Permission, output) => {
      if (input.pattern) {
        const patterns = Array.isArray(input.pattern) ? input.pattern : [input.pattern];

        for (const pattern of patterns) {
          if (typeof pattern === 'string' && isPathInAddedDirectories(pattern)) {
            output.status = 'allow';
            return;
          }
        }
      }
    }
  };
};

export default addDirPlugin;
