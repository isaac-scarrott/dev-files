local luasnip = require "luasnip"
local utils = require "isaac.snippet_utils"

luasnip.add_snippets("lua", { utils.print_snip("log", "P") })
