export interface AddedDirectory {
  directory: string;
  addedAt: number;
}

export interface SessionDirectories {
  sessionId: string;
  directories: AddedDirectory[];
}

export interface AddDirResult {
  directory: string;
  status: 'added' | 'error';
  message: string;
  fileCount?: number;
}
