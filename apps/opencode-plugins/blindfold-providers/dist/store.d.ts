export type Provider = "1password" | "bitwarden";
/** What the settings page saves for an account. Settings only: no token, key, password or session. */
export type Stored = {
    provider: Provider;
    label: string;
    enabled: boolean;
    allowedOrigins?: string[];
    autoLockMinutes?: number;
    /** 1Password: the vault names to list. */
    vaults?: string[];
    /** Bitwarden: only items of this organisation. */
    organizationId?: string;
    confirmEveryUse?: boolean;
    alwaysAllowOtp?: boolean;
};
/** Steps only the user can do and that cannot be detected without touching the vendor's app. */
export type Confirmed = {
    opAppIntegrationOff?: boolean;
};
export type StoreData = {
    version: 1;
    accounts: Record<string, Stored>;
    confirmed: Confirmed;
};
/** Per user, not per project: one file for every location the service serves (the plugin storage's scope is per location). */
export declare const defaultStoreFile: () => string;
/** The accounts file: private to the user (0600 in a 0700 directory), replaced whole through a rename. */
export declare function accountStore(file: string): {
    file: string;
    read(): StoreData;
    write(data: StoreData): void;
};
export type AccountStore = ReturnType<typeof accountStore>;
