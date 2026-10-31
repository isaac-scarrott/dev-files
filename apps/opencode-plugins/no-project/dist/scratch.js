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
 * A fresh scratch folder for one session. The leaf is always `No project` so the host labels every one of them the
 * same; the unique part is the parent. An absolute `directory` option pins a single shared folder instead.
 */
export function scratchDirectory(home, option, id = crypto.randomUUID()) {
    if (typeof option === "string" && option.startsWith("/"))
        return trim(option);
    return `${trim(home)}/${BASE_UNDER_HOME}/${id}/${NAME}`;
}
/** The pinned folder from the `directory` option, if one is set. */
export function pinnedDirectory(option) {
    return typeof option === "string" && option.startsWith("/") ? trim(option) : undefined;
}
