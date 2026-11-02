export const NAME = "No project";
/** Under the server's data dir (`<XDG data>/opencode`), where each scratch session gets `<uuid>/No project`. */
export const BASE_NAME = "no-project";
export const BASE_UNDER_HOME = ".local/share/opencode/no-project";
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const README = `# No project

Sessions started with "New session without a project" run in this folder, so no repository, AGENTS.md or
project config is picked up. The folder belongs to one session and is deleted with it.
`;
export const readme = () => new TextEncoder().encode(README);
const trim = (path) => path.replace(/\/+$/, "");
/**
 * The `directory` option: undefined when unset, else an absolute path without `.` or `..` segments.
 * Throws on anything else so a typo fails the plugin at setup instead of opening sessions somewhere unintended.
 */
export function directoryOption(option) {
    if (option === undefined || option === "")
        return undefined;
    if (typeof option !== "string" || !option.startsWith("/") || option.includes("\0") || option.split("/").some((part) => part === "." || part === ".."))
        throw new Error(`no-project: option "directory" must be an absolute path without "." or ".." segments, got ${JSON.stringify(option)}`);
    return trim(option) || "/";
}
/**
 * A fresh scratch folder for one session. The leaf is always `No project` so the host labels every one of them the
 * same; the unique part is the parent. A validated `directory` pins a single shared folder instead.
 */
export function scratchDirectory(home, pinned, id = crypto.randomUUID()) {
    return pinned ?? `${trim(home)}/${BASE_UNDER_HOME}/${id}/${NAME}`;
}
