return {
  "pmizio/typescript-tools.nvim",
  dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
  ft = { "typescript", "typescriptreact", "javascript", "javascriptreact" },
  config = function()
    local lsp = require("isaac.lsp")
    local utils = require("isaac.utils")

    local ok, tst = pcall(require, "typescript-tools")

    if not ok or utils.is_npm_installed("vue") then
        print("Could not setup typescript-tools")
      return
    end

        print("Could setup typescript-tools")

    tst.setup({
      handlers = lsp.handlers,
      on_attach = function(client, bufnr)
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false

        lsp.on_attach(client, bufnr)
      end,
      settings = {
        separate_diagnostic_server = true,
        composite_mode = "separate_diagnostic",
        publish_diagnostic_on = "insert_leave",
        -- tsserver_logs = "verbose",
        tsserver_file_preferences = {
          importModuleSpecifierPreference = "non-relative",
        },
      },
    })
  end,
}
