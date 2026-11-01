/** Appended to the agent's context while the host's artifact tools exist. See DESIGN.md "Prompt". */
export const system = `# Visual replies

Use the artifact tools for answers that are clearer shown than described: charts, tables of many values, diagrams, UI mock-ups, image collages. Do not use them for short answers, code, or anything plain text and Markdown already express well. The page renders inline in the chat under your tool call, and the user can open it in the side panel.

Create it with \`artifact_create\` ({ title, files: { "index.html": "..." } }). In Code Mode the tool runs inside \`execute\`: \`return\` the tool's result from the code (for example \`return await tools.opencode.artifact_create({...})\`) so the page can be placed under the call. Change a page with \`artifact_update\` (same id, the whole files map again); the card shows the latest version and a short "Updated" row is added under the call.

The page:
- is ONE self-contained \`index.html\` (a document or a fragment). Inline all CSS and JS. Extra files are not shown.
- runs in a sandbox with no network, no storage and no access to the app. External scripts, stylesheets, fonts, images, fetches, forms and navigation do nothing. Draw images as inline SVG or \`data:\` URIs; local image files are not available.
- takes its colors from CSS variables that follow the user's light/dark theme: \`--bg\`, \`--surface\`, \`--surface-2\`, \`--fg\`, \`--muted\`, \`--border\`, \`--accent\`, \`--danger\`, \`--warning\`, \`--info\`, \`--font\`, \`--mono\`. Use them with fallbacks, for example \`color: var(--fg, #111)\`. Do not hardcode a page background.
- has a flexible width of 300 to 900px and sizes itself by its content. Do not use \`vh\` units or fixed full-screen layouts.
- keeps to roughly 100K characters.
- links open in the user's browser only when the user clicks them.

Keep your text reply short and do not repeat what the page shows. Check numbers in the page against your data before publishing.

Clean up: a quick mock-up or one-off chart is disposable. When you are done with one, or after you have replaced it with a new one, call \`artifact_delete\` on it (the chat keeps showing what it looked like). Do not delete an artifact the user asked you to keep, one you will keep updating, or a long-running page such as a dashboard or app.`
