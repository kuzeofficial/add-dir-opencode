import { tool } from '@opencode-ai/plugin/tool';
import type { Plugin } from '@opencode-ai/plugin';
import type { Permission } from '@opencode-ai/sdk';
import fs from 'fs';
import path from 'path';
import { resolveDirectoryPath, validateDirectory, countFiles, isPathInDirectory } from './utils.js';

const SESSIONS_FILE = path.join(__dirname, '.sessions.json');
const MAX_SESSIONS = 50;
const SESSION_AGE_DAYS = 30;

interface SessionData {
  dirs: string[];
  lastAccessed: number;
}

interface Sessions {
  [sessionId: string]: SessionData;
}

const cleanedSessions = new Set<string>();

function readSessions(): Sessions {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      return JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf-8')) as Sessions;
    }
  } catch (error) {
    console.error('Failed to read sessions:', error);
  }
  return {};
}

function writeSessions(sessions: Sessions): void {
  fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2));
}

function getSessionDirs(sessionId: string): string[] {
  const sessions = readSessions();
  const session = sessions[sessionId];

  if (session) {
    session.lastAccessed = Date.now();
    writeSessions(sessions);
    return session.dirs;
  }

  return [];
}

function addSessionDir(sessionId: string, dirPath: string): void {
  const sessions = readSessions();
  const normalized = resolveDirectoryPath(dirPath);

  if (!sessions[sessionId]) {
    sessions[sessionId] = { dirs: [], lastAccessed: Date.now() };
  }

  if (!sessions[sessionId].dirs.includes(normalized)) {
    sessions[sessionId].dirs.push(normalized);
    sessions[sessionId].lastAccessed = Date.now();
    writeSessions(sessions);
  }
}

function cleanOldSessions(): void {
  const sessions = readSessions();
  const now = Date.now();
  const maxAge = SESSION_AGE_DAYS * 24 * 60 * 60 * 1000;

  const entries = Object.entries(sessions);
  const recentSessions = entries.filter(([, data]) =>
    now - data.lastAccessed < maxAge
  );

  if (recentSessions.length <= MAX_SESSIONS) {
    if (recentSessions.length === entries.length) {
      return;
    }
  } else {
    recentSessions.sort(([, a], [, b]) => b.lastAccessed - a.lastAccessed);
    recentSessions.splice(MAX_SESSIONS);
  }

  const cleanedSessions: Sessions = {};
  recentSessions.forEach(([id, data]) => {
    cleanedSessions[id] = data;
  });

  writeSessions(cleanedSessions);
}

function isInSessionDirs(filePath: string, dirs: string[]): boolean {
  const normalizedFilePath = path.resolve(filePath);

  for (const dir of dirs) {
    const normalizedDir = path.resolve(dir);
    const relative = path.relative(normalizedDir, normalizedFilePath);
    const isInside = !relative.startsWith('..') && !path.isAbsolute(relative);

    if (isInside) {
      return true;
    }
  }

  return false;
}

const addDirPlugin: Plugin = async () => {
  return {
    tool: {
      add_dir: tool({
        description: 'Add a directory to the workspace. Access is auto-approved for files in added directories.',
        args: {
          directory: tool.schema.string().describe('Absolute path to the directory')
        },
        execute: async ({ directory }, context) => {
          const sessionId = context.sessionID;
          const resolvedPath = resolveDirectoryPath(directory);
          validateDirectory(resolvedPath);
          addSessionDir(sessionId, resolvedPath);
          const fileCount = countFiles(resolvedPath);

          return JSON.stringify({
            directory: resolvedPath,
            status: 'added',
            message: 'Directory added to workspace',
            fileCount
          }, null, 2);
        }
      })
    },
    'chat.message': async (context) => {
      getSessionDirs(context.sessionID);

      if (!cleanedSessions.has(context.sessionID)) {
        cleanOldSessions();
        cleanedSessions.add(context.sessionID);
      }
    },
    'permission.ask': async (input: Permission, output: { status: 'allow' | 'deny' | 'ask' }) => {
      const dirs = getSessionDirs(input.sessionID);
      const check = (value: unknown) => typeof value === 'string' && isInSessionDirs(value, dirs);

      const approved = [
        input.type === 'external_directory',
        check(input.title),
        input.pattern && (Array.isArray(input.pattern) ? input.pattern : [input.pattern]).some(check),
        Object.values(input.metadata || {}).flat().some(check)
      ].some(Boolean);

      if (approved) {
        output.status = 'allow';
      }
    }
  };
};

export default addDirPlugin;
