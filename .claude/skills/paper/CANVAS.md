# Read, find, bulk-edit and verify

All of these are `node canvas.mjs <command>`; a value that itself starts with `--` is written `--name='--color-*'`.

## Read

- `boards [--file F] [--page P] [--name "<glob>"]`: the file, its pages, then one line per artboard: `id  name  w×h  @x,y`. Without `--file` it reads the file open in Paper.
- `size [--file F] [--exact]`: one line per page (`id  name  frames  layers  ~KB`), then the file total. Layers are Paper's own count; bytes are layers × 200, the average of this skill's captures, and `--exact` exports every artboard's markup to sum it instead. Run it before a large write: Paper's size limit is invisible until a write fails.
- `tree <nodeId> --file F [--depth N] [--grep <regex>]`: the layer tree, one line per layer with its id and size; `--grep` keeps matching lines.
- `find --file F [--page P | --node id] --text "*copy*" | --color "#005670" | --font-size 16`: ids and names of matching layers; colours match by value, and a literal also finds layers bound to a token of that value.
- `tokens --file F [--name='--color-*']`: design tokens as CSS, when a task needs them.

Reach for the Paper MCP's `get_jsx` or `get_computed_styles` when you need one layer's exact styles; they return the whole subtree, so pass the smallest node that answers the question.

## Bulk edit

These act on a page's top-level artboards whose name matches `--name "<glob>"` (`*` is the wildcard). Run each with `--dry-run` first; it prints the count and the names.

- `rename --file F --page P --name "Home · *" --replace "Acme" --with "Acme UK"`
- `move --file F --page P --name "Home · *" (--dx 0 --dy 2400 | --x 240 --y 900)`; `--x/--y` place the selection's top-left corner.
- `style --file F --page P --name "* · 390 · *" --set '{"borderRadius":"24px"}'`
- `delete --file F --page P --name "Scratch · *"`

Done when the printed count equals the dry run's and `boards` shows the result.

## Lint

`lint --file F --page P [--only names,groups,accent,phrases] [--accent <hex>]` prints one line per violation (`rule  id  name  detail`), then a count, and exits 1 when there are any:

- `names`: a frame not named `<Screen> · <width> · <brand> · <state>`; backgrounds, title boards and `Notes · …` are exempt.
- `groups`: a frame outside every group background.
- `accent`: a frame with two or more buttons filled with the action colour, given by `--accent` or inferred as the commonest saturated button fill on the page. A button is a layer named `button…`, as captures name them.
- `phrases`: text claiming data the design cannot back, from `lint-phrases.txt` in the skill directory, one phrase per line.

Done when the count is 0 or each line left is explained in your report.

## Verify

`verify --file F --page P [--name "<glob>"]` compares each frame of the page's last journey with the browser screenshot taken at capture, and prints `match%  name  id  worst x y w×h (n% off)`. `--open-worst` also writes a side-by-side crop of the worst region (source left, Paper right) and prints its path: read that image only for frames you need to explain.

`verify --file F --node <id> (--source-node <id> [--source-file A] | --source <png>)` compares any frame with another Paper node, in this file or another, or with a picture on disk: a copy against its original.

A long page whose source scrolls inside an app shell is compared over the part the screenshot covers. Text set in a font Paper lacks lowers the score evenly across the frame; one bad region points at a real difference.

Done when every frame has a line and each one below 85% has been opened or explained.
