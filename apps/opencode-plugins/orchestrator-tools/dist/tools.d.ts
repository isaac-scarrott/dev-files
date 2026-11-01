import type { Plugin } from "@opencode/plugin";
import type { Orchestrator } from "./orchestrator.js";
import type { Options } from "./options.js";
export declare const NAMESPACE = "orchestrate";
type Editor = Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0];
export declare const SEND_MESSAGE_DESCRIPTION: string;
export declare const LIST_PEERS_DESCRIPTION = "List the sessions you can message, as `name [ref]` with relation (parent, child, sibling, other), state and directory. The name and ref are the address; pass either as `to` of send_message. Reach beyond your own tree needs the plugin option scope: \"project\" or \"all\".";
export declare function registerTools(editor: Editor, orchestrator: Orchestrator, options: Options): void;
export {};
