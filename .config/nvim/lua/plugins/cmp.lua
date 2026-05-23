return {
  "saghen/blink.cmp",
  dependencies = { "L3MON4D3/LuaSnip" },
  version = "*",
  event = { "InsertEnter", "CmdlineEnter" },
  opts = {
    snippets = { preset = "luasnip" },
    sources = {
      default = { "lsp", "luasnip", "path", "buffer" },
    },
    completion = {
      list = { selection = { preselect = false, auto_insert = false } },
      menu = {
        draw = {
          columns = { { "kind_icon" }, { "label", "label_description", gap = 1 } },
        },
      },
    },
    cmdline = {
      enabled = true,
      completion = { menu = { auto_show = true } },
    },
    keymap = {
      preset = "none",
      ["<C-k>"] = { "select_prev", "fallback" },
      ["<C-j>"] = { "select_next", "fallback" },
      ["<C-b>"] = { "scroll_documentation_up", "fallback" },
      ["<C-f>"] = { "scroll_documentation_down", "fallback" },
      ["<C-Space>"] = { "show", "fallback" },
      ["<C-e>"] = { "hide", "fallback" },
      ["<CR>"] = { "accept", "fallback" },
      ["<Tab>"] = {
        function(cmp)
          local ok, copilot = pcall(require, "copilot.suggestion")
          if ok and copilot.is_visible() then
            copilot.accept()
            return true
          end
          if cmp.is_visible() then
            return cmp.select_next()
          end
        end,
        "fallback",
      },
    },
  },
}
