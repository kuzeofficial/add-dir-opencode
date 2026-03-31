export interface DirEntry {
    path: string;
    persist: boolean;
}
export declare function loadDirs(): Map<string, DirEntry>;
export declare function saveDirs(dirs: Map<string, DirEntry>): void;
export declare function isChildOf(parent: string, child: string): boolean;
export declare function matchesDirs(dirs: Map<string, DirEntry>, filepath: string): boolean;
