import type { Plugin } from "@opencode/plugin";
import type { Orchestrator } from "./orchestrator.js";
import type { Options } from "./options.js";
export declare const NAMESPACE = "orchestrate";
type Editor = Parameters<Parameters<Plugin.Context["tool"]["transform"]>[0]>[0];
export declare function registerTools(editor: Editor, orchestrator: Orchestrator, options: Options): void;
export {};
