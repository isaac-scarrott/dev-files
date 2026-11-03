export declare function replacement(name: string): string;
export declare class Redactor {
    #private;
    get size(): number;
    names(): string[];
    entries(): [string, string][];
    get(name: string): string | undefined;
    set(name: string, value: string): void;
    /**
     * Redacts a value under a label without storing it as a named secret: it is not returned by `get`, not offered to shell
     * commands and not listed by `names`. For values read from a provider, which are read again on each use.
     */
    track(label: string, value: string): void;
    delete(name: string): boolean;
    text(input: string): string;
    /** Redacts strings nested in plain objects and arrays, preserving references when nothing changes. */
    value<T>(input: T): T;
}
