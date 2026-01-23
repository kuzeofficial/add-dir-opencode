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

export function isIgnoredDirectory(dirName: string): boolean {
  return IGNORED_DIRECTORIES.has(dirName);
}

export function countFiles(directory: string): number {
  let fileCount = 0;

  function scanDir(dir: string): void {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (isIgnoredDirectory(entry.name)) {
          continue;
        }

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          fileCount++;
        }
      }
    } catch (error) {
      console.error(`Error scanning ${dir}:`, error);
    }
  }

  scanDir(directory);
  return fileCount;
}

export function resolveDirectoryPath(dirPath: string): string {
  return path.resolve(dirPath);
}

export function validateDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directory does not exist: ${dirPath}`);
  }

  const stats = fs.statSync(dirPath);

  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${dirPath}`);
  }

  try {
    fs.accessSync(dirPath, fs.constants.R_OK);
  } catch (error) {
    throw new Error(`Permission denied: Cannot read directory ${dirPath}`);
  }
}

export function isPathInDirectory(testPath: string, dirPath: string): boolean {
  const normalizedTestPath = path.resolve(testPath);
  const normalizedDirPath = path.resolve(dirPath);
  const relative = path.relative(normalizedDirPath, normalizedTestPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}
