# Copy or move frames between Paper files

Paper's `move_nodes` and `duplicate_nodes` stay inside one file. `transfer.mjs` crosses files: it exports each frame (`get_jsx`, inline styles) and rebuilds it in the target.

`node transfer.mjs copy --from-file A (--nodes id1,id2 | --page P) --to-file B --to-page Q`

1. Run it with `--dry-run`: it exports and prints bytes and node counts per frame, writing nothing. Done when the totals fit the target (a file near its limit answers with the size warning).
2. Run the copy. Done when every result reads `verified: true`: equal node and text counts, hidden layers re-hidden, every image fill uploaded to the target.
3. Compare one copy with its source a few seconds after the run, since text and images render late: `node canvas.mjs verify --file B --node <copy> --source-node <source> --source-file A` ([`CANVAS.md`](CANVAS.md)). Each result also lists `styleDiffs`, the styles Paper reports differently on the copy; anything beyond the `display` of a text layer needs this comparison.

Flags:

- `--tokens` creates the design tokens the frames use in the target, so `var(--…)` stays live; without it each token is replaced by its value. A token the target already holds with another value is inlined and listed under `tokens.conflicts`.
- `--keep-position` reuses the source x/y; the default keeps the frames' arrangement and places it right of the target page's content.
- `--move` deletes each source frame once its copy has verified.
- `--dump <dir>` writes `source.jsx`, `copy.html` and `copy.jsx` per frame for debugging.

Carried over: name, size, layer order and names, hidden layers, line breaks, SVGs and image fills (Paper re-hosts them under the target file, so the copy outlives the source). Left behind: node ids, comments and export settings; a nested node arrives as its own artboard.
