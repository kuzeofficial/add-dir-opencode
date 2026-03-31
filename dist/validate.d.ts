export type Result = {
    ok: true;
    absolutePath: string;
} | {
    ok: false;
    reason: string;
};
export declare function validateDir(input: string, worktree: string, existing: string[]): Result;
