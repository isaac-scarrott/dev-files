import { limits } from "./pages"

export const toolName = "publish_html"

export const toolDescription = `Show the user a self-contained HTML page inline in the chat. Use it when a picture beats prose: a chart, comparison table, diagram, image collage, UI mockup or layout. The page renders above your text reply; keep the reply short and do not repeat the page's content.`

export const system = `# Visual replies

Use \`${toolName}\` for answers that are clearer shown than described: charts, tables of many values, diagrams, mockups, image collages. Do not use it for short answers, code, or anything plain text and Markdown already express well. Publish at most one page per answer unless asked for more.

The page:
- is one self-contained HTML document or fragment. Inline all CSS and JS. It runs in a sandbox with no network, no storage and no access to the app, so external scripts, fonts, images and fetches do nothing.
- takes its colors from CSS variables that follow the user's light/dark theme: \`--bg\`, \`--surface\`, \`--surface-2\`, \`--fg\`, \`--muted\`, \`--border\`, \`--accent\`, \`--danger\`, \`--warning\`, \`--info\`, \`--font\`, \`--mono\`. Use them with fallbacks, for example \`color: var(--fg, #111)\`. Do not hardcode a page background.
- has a flexible width of 300 to 900px and sizes itself by its content. Do not use \`vh\` units or fixed full-screen layouts.
- shows local images by listing their file paths in \`images\` and using the same string in \`src\`. Images up to ${limits.imageBytes / 1_000_000}MB each, png, jpg, gif, webp or svg. Everything else must be inline (inline SVG, CSS, data URIs).
- stays under ${limits.html / 1000}K characters of HTML.

Links open in the user's browser. Check numbers in the page against your data before publishing.`
