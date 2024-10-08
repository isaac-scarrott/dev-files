local luasnip = require "luasnip"
local utils = require "isaac.snippet_utils"

local snippet = luasnip.snippet
local i = luasnip.insert_node
local fmt = require("luasnip.extras.fmt").fmt

local jsTsSnippets = {
  snippet("fln", { utils.file_name(true) }),
  snippet(
    "fc",
    fmt(
      [[
      import React from 'react';

      interface Props {{
      }}

      const {}: React.FC<Props> = () => {{
        {}
      }}
      ]],
      { utils.file_name(), i(1) }
    )
  ),
}

for _, suffix in pairs { "log", "dir", "error", "trace" } do
  table.insert(jsTsSnippets, utils.print_snip(suffix, "console." .. suffix))
end

for _, ft in pairs { "javascript", "javascriptreact", "typescript", "typescriptreact" } do
  luasnip.add_snippets(ft, jsTsSnippets)
end
