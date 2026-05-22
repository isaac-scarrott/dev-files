return {
  "williamboman/mason.nvim",
  dependencies = {
    "williamboman/mason-lspconfig.nvim",
    "WhoIsSethDaniel/mason-tool-installer.nvim",
  },
  event = "BufReadPre",
  cmd = "Mason",

  config = function()
    local mason_lspconfig = require("mason-lspconfig")
    local tool_installer = require("mason-tool-installer")

    require("mason").setup({})

    mason_lspconfig.setup({
      ensure_installed = { "lua_ls", "eslint", "stylelint_lsp" },
      -- mason-lspconfig auto-enables installed servers via vim.lsp.enable()
      automatic_enable = true,
    })

    tool_installer.setup({
      ensure_installed = {
        -- Linters
        "luacheck",
        -- Formatters
        "prettierd",
        "stylua",
      },
    })

    tool_installer.run_on_start()

    -- Configure individual servers via vim.lsp.config() before they are enabled
    -- eslint: disable formatting (handled by prettierd via conform.nvim)
    vim.lsp.config("eslint", {
      on_attach = function(client, bufnr)
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false
      end,
    })

    -- stylelint_lsp: add postcss filetype
    local stylelint_defaults = vim.lsp.config.stylelint_lsp or {}
    local default_filetypes = stylelint_defaults.filetypes or { "css", "less", "scss", "sugarss", "vue", "wxss" }
    vim.lsp.config("stylelint_lsp", {
      filetypes = vim.list_extend({ "postcss" }, default_filetypes),
    })
  end,
}
