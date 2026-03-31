import type { DirEntry } from "./state.js";
export declare function permissionGlob(dirPath: string): string;
export declare function grantSession(sdk: any, sessionID: string, text: string): Promise<void>;
export declare function grantSessionAsync(sdk: any, sessionID: string, text: string): void;
export declare function shouldGrantBeforeTool(dirs: Map<string, DirEntry>, tool: string, args: any): boolean;
export declare function autoApprovePermission(sdk: any, props: any, dirs: Map<string, DirEntry>): Promise<void>;
