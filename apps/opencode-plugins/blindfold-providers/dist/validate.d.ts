import type { Provider, Stored } from "./store.js";
/** The settings of an account from what the page sent. Throws a message safe to show. Secrets are not read here. */
export declare function cleanSettings(input: unknown, provider: Provider): Omit<Stored, "provider" | "enabled"> & {
    enabled?: boolean;
};
/** A credential for the keychain: a non-empty single line. */
export declare function secret(value: unknown, name: string): string;
/** An account id from its name: lowercase letters, digits, - and _, starting with a letter, unique among `taken`. */
export declare function makeId(label: string, provider: Provider, taken: ReadonlySet<string>): string;
