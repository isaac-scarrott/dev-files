import { isLocked, patternMatches } from "./providers-contract.js";
import { covering, nameRule, permitted } from "./rules.js";
const PASSWORD_WORDS = new Set(["PASS", "PASSWORD", "PASSWD", "PWD", "PASSPHRASE"]);
const USER_WORDS = new Set(["USER", "USERNAME", "LOGIN", "EMAIL", "MAIL"]);
/** The part of an item a field name means: PASSWORD → password, EMAIL → username, an otp field → otp, else a label. */
export function itemFieldOf(ask) {
    if (ask.item)
        return ask.item;
    const words = ask.name.split("_").filter(Boolean);
    if (ask.field.kind === "otp")
        return "otp";
    if (words.some((word) => PASSWORD_WORDS.has(word)))
        return "password";
    if (words.some((word) => USER_WORDS.has(word)))
        return "username";
    return ask.name;
}
const fieldRef = (key) => (key === "username" || key === "password" || key === "otp" ? key : { label: key });
/**
 * Which accounts can serve each field, with nothing read: only references (titles and ids) are looked at. A field with no
 * provider at all is simply absent from the plan and is typed in the card, as before providers existed.
 */
export function createBroker(deps) {
    async function planOne(ask, accounts, saved, status) {
        const itemField = itemFieldOf(ask);
        const rule = nameRule(ask.name, deps.rules);
        let tries;
        if (rule?.ref)
            tries = rule.account.flatMap((id) => accounts.filter((account) => account.id === id).map((account) => ({ account, ref: rule.ref })));
        else if (ask.origin)
            tries = permitted(ask.origin, accounts, deps.rules).flatMap((info) => accounts.filter((account) => account.id === info.id).map((account) => ({ account })));
        else
            return undefined;
        if (accounts.length === 0)
            return undefined;
        let candidates = [];
        const refs = new Map();
        const hints = [];
        let searched = false;
        const add = (account, state, methods, found) => {
            const key = found ? `${account.id}:${found.item.id}` : account.id;
            const use = { account: account.id, field: itemField, item: found?.item.id, origin: rule?.ref ? undefined : ask.origin, name: ask.name };
            const covered = state === "ready" && covering(saved, use) !== undefined;
            candidates.push({ key, account: account.id, label: account.label, state, methods, ...(found ? { item: { id: found.item.id, title: found.item.title } } : {}), covered });
            if (found)
                refs.set(key, found);
        };
        for (const { account, ref } of tries) {
            const state = await status(account);
            if (state.state === "unavailable") {
                hints.push(`${account.label}: ${state.reason}`);
                continue;
            }
            try {
                if (ref) {
                    const found = await account.resolve(ref);
                    add(account, state.state === "locked" ? "locked" : "ready", state.state === "locked" ? [...state.methods] : [], found);
                }
                else if (state.state === "locked")
                    add(account, "locked", [...state.methods]);
                else {
                    const items = await account.findByOrigin(ask.origin);
                    searched = true;
                    const holding = items.filter((item) => item.fields.includes(itemField));
                    if (items.length > 0 && holding.length === 0)
                        hints.push(`${account.label}: the login has no ${itemField}`);
                    for (const item of holding)
                        add(account, "ready", [], { item, field: fieldRef(itemField) });
                }
            }
            catch (error) {
                // The session ended between the status and the listing.
                if (isLocked(error))
                    add(account, "locked", [...error.methods]);
                else
                    hints.push(error instanceof Error ? error.message : String(error));
            }
        }
        // A locked account cannot be searched. It is listed only when nothing unlocked can serve the field, or when a rule names
        // it for this site; otherwise every locked vault would show up as a choice on every page.
        const named = new Set(ask.origin ? deps.rules.filter((item) => item.origin !== undefined && patternMatches(item.origin, ask.origin)).flatMap((item) => item.account) : []);
        const skipped = candidates.filter((item) => item.state === "locked" && !named.has(item.account));
        if (searched || candidates.some((item) => item.state === "ready"))
            candidates = candidates.filter((item) => item.state === "ready" || named.has(item.account));
        if (candidates.length === 0) {
            const locked = skipped.length > 0 ? ` Not searched, locked: ${skipped.map((item) => item.label).join(", ")}.` : "";
            return { itemField, refs, source: { state: "unavailable", candidates: [], hint: (hints[0] ?? "No login for this site in your vaults.") + locked } };
        }
        const chosen = candidates.find((item) => item.covered) ?? (candidates.length === 1 ? candidates[0] : undefined);
        return { itemField, refs, source: { state: "choose", candidates, ...(chosen ? { selected: chosen.key } : {}) } };
    }
    return {
        async plan(asks) {
            const accounts = deps.accounts();
            const saved = await deps.saved();
            const states = new Map();
            const status = (account) => {
                const known = states.get(account.id) ?? account.status();
                states.set(account.id, known);
                return known;
            };
            const plans = new Map();
            for (const ask of asks) {
                const planned = await planOne(ask, accounts, saved, status);
                if (planned)
                    plans.set(ask.name, planned);
            }
            return plans;
        },
        /** Every provider field has one chosen, ready, covered candidate: nothing for the user to decide. */
        silent(asks, plans) {
            const provider = asks.filter((ask) => plans.get(ask.name)?.source.state === "choose");
            if (provider.length !== asks.length)
                return false;
            return provider.every((ask) => {
                const source = plans.get(ask.name).source;
                const picked = source.candidates.find((item) => item.key === source.selected);
                return picked !== undefined && picked.state === "ready" && picked.covered;
            });
        },
        /** Reads the value of one planned field from the chosen candidate. Throws LockedError if the session ended. */
        async read(planned, key, signal) {
            const found = planned.refs.get(key);
            const candidate = planned.source.candidates.find((item) => item.key === key);
            const account = deps.accounts().find((item) => item.id === candidate?.account);
            if (!found || !candidate || !account)
                throw new Error("That account is no longer available.");
            return { value: await account.read(found.item, found.field, signal), account, candidate };
        },
    };
}
