# Fixtures

`dialog-2.2.5.html` and `dialog-2.2.5-starred.html` are the `.model-dialog` element of OpenCode Desktop 2.2.5, copied from a running app (private harness, stub providers `alpha` and `zeta`, the built-in `opencode` provider). The plugin's pane and its `data-mp-hidden` attribute are removed, so each file is the host's own markup. The starred one has `alpha:a-big` in Favorites.

Refresh after a host update: open the dialog in the harness, `cloneNode(true)` the `.model-dialog`, delete `[data-mp-pane]`, remove `data-mp-hidden`, save `outerHTML`.
