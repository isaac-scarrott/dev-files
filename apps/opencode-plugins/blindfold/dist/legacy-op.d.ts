/** `op read` for a `secrets` entry when no 1Password account of blindfold-providers can serve it. */
export declare function readOnePassword(name: string, reference: string, account: string | undefined): Promise<string>;
