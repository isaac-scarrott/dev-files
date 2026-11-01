/**
 * The plugin API has no logger and the service's stderr is not kept anywhere a user can read, so every line goes both to
 * stderr and to `scheduler.log`. The file is rotated once at startup when it passes 1 MB. Prompts are never logged.
 */
export declare function createLog(dir: string, now: () => number): (message: string) => void;
