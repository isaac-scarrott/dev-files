#!/usr/bin/env node
// Build a self-contained architecture map: inline the ArchMap runtime + CSS + your model.
//   node build-map.mjs <model.json> <out.html>
// The agent authors only <model.json> (see RUNTIME.md). Everything else is bundled.
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.join(here, "..", "assets");
const [, , modelPath, outPath] = process.argv;
if (!modelPath || !outPath) { console.error("usage: node build-map.mjs <model.json> <out.html>"); process.exit(1); }

const model = JSON.parse(await readFile(modelPath, "utf8"));
const css = await readFile(path.join(assets, "map.css"), "utf8");
const dagre = await readFile(path.join(assets, "vendor", "dagre.min.js"), "utf8");
const js = await readFile(path.join(assets, "map.js"), "utf8");
const payload = JSON.stringify(model).replace(/</g, "\\u003c"); // safe inside <script>

const html = `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${String(model.repo || "Architecture").replace(/</g, "&lt;")} — architecture map</title>
<style>
${css}
</style></head>
<body>
<script>window.structuredClone||(window.structuredClone=function(o){return JSON.parse(JSON.stringify(o))});</script>
<script>${dagre}</script>
<script>
${js}
</script>
<script>ArchMap.render(${payload});</script>
</body>
</html>
`;
await writeFile(outPath, html);
console.log("wrote " + outPath);
