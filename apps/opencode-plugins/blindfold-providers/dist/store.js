import { chmodSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
/** Per user, not per project: one file for every location the service serves (the plugin storage's scope is per location). */
export const defaultStoreFile = () => join(homedir(), ".config", "blindfold", "accounts.json");
const empty = () => ({ version: 1, accounts: {}, confirmed: {} });
/** The accounts file: private to the user (0600 in a 0700 directory), replaced whole through a rename. */
export function accountStore(file) {
    return {
        file,
        read() {
            try {
                const data = JSON.parse(readFileSync(file, "utf8"));
                if (typeof data !== "object" || data === null || typeof data.accounts !== "object" || data.accounts === null)
                    return empty();
                return { version: 1, accounts: data.accounts, confirmed: typeof data.confirmed === "object" && data.confirmed !== null ? data.confirmed : {} };
            }
            catch {
                return empty();
            }
        },
        write(data) {
            mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
            const temp = `${file}.${process.pid}.tmp`;
            writeFileSync(temp, JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
            chmodSync(temp, 0o600);
            renameSync(temp, file);
        },
    };
}
