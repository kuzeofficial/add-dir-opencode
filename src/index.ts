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

interface ScanResult {
  files: FileInfo[];
  tree: string[];
  fileCount: number;
  skipped: number;
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

function sortDirectoryEntries(entries: fs.Dirent[]): fs.Dirent[] {
  return entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) {
      return -1;
    }
    if (!a.isDirectory() && b.isDirectory()) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function createTreeEntry(name: string, isDirectory: boolean, depth: number): string {
  const indent = '  '.repeat(depth);
  const suffix = isDirectory ? '/' : '';
  return `${indent}${name}${suffix}`;
}

function readFileContent(filePath: string, maxSize: number): { content: string | undefined; isTruncated: boolean } {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');

    if (content.length > maxSize) {
      return {
        content: content.slice(0, maxSize),
        isTruncated: true
      };
    }

    return {
      content,
      isTruncated: false
    };
  } catch (error) {
    return {
      content: undefined,
      isTruncated: false
    };
  }
}

function isFileSizeValid(filePath: string): boolean {
  const stats = fs.statSync(filePath);
  return stats.size <= MAX_FILE_SIZE_BYTES;
}

function shouldProcessDirectory(entry: fs.Dirent, result: ScanResult): boolean {
  if (result.fileCount >= MAX_FILES) {
    return false;
  }
  if (!entry.isDirectory()) {
    return false;
  }
  if (shouldIgnoreDirectory(entry.name)) {
    result.skipped++;
    return false;
  }
  return true;
}

function shouldProcessFile(entry: fs.Dirent, filePath: string, result: ScanResult): boolean {
  if (result.fileCount >= MAX_FILES) {
    return false;
  }
  if (!entry.isFile()) {
    return false;
  }
  if (isBinaryFile(entry.name)) {
    result.skipped++;
    return false;
  }
  if (!isFileSizeValid(filePath)) {
    result.skipped++;
    return false;
  }
  return true;
}

function scanDirectory(
  dirPath: string,
  baseDir: string,
  files: FileInfo[] = [],
  tree: string[] = [],
  depth: number = 0,
  fileCount: number = 0
): ScanResult {
  const result: ScanResult = {
    files,
    tree,
    fileCount,
    skipped: 0
  };

  if (result.fileCount >= MAX_FILES) {
    return result;
  }

  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const sortedEntries = sortDirectoryEntries(entries);

  for (const entry of sortedEntries) {
    if (result.fileCount >= MAX_FILES) {
      break;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(baseDir, fullPath);

    if (shouldProcessDirectory(entry, result)) {
      result.tree.push(createTreeEntry(entry.name, true, depth));

      const nestedResult = scanDirectory(
        fullPath,
        baseDir,
        result.files,
        result.tree,
        depth + 1,
        result.fileCount
      );

      result.files = nestedResult.files;
      result.tree = nestedResult.tree;
      result.fileCount = nestedResult.fileCount;
      result.skipped += nestedResult.skipped;
    } else if (shouldProcessFile(entry, fullPath, result)) {
      result.tree.push(createTreeEntry(entry.name, false, depth));

      const stats = fs.statSync(fullPath);
      const contentResult = readFileContent(fullPath, MAX_FILE_SIZE_BYTES);

      result.files.push({
        path: relativePath,
        size: stats.size,
        content: contentResult.content,
        isTruncated: contentResult.isTruncated
      });

      result.fileCount++;
    }
  }

  return result;
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
