return {
  "pmizio/typescript-tools.nvim",
  dependencies = { "nvim-lua/plenary.nvim", "neovim/nvim-lspconfig" },
  ft = { "typescript", "typescriptreact", "javascript", "javascriptreact" },
  config = function()
    local lsp = require("isaac.lsp")
    local utils = require("isaac.utils")

    local ok, tst = pcall(require, "typescript-tools")

    if not ok or utils.is_npm_installed("vue") then
      return
    end

    tst.setup({
      handlers = lsp.handlers,
      on_attach = function(client, bufnr)
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false

        lsp.on_attach(client, bufnr)

        -- TypeScript-specific keymaps
        local opts = { buffer = bufnr }
        vim.keymap.set("n", "<leader>oi", "<cmd>TSToolsOrganizeImports<CR>", opts)
        vim.keymap.set("n", "<leader>ru", "<cmd>TSToolsRemoveUnused<CR>", opts)
        vim.keymap.set("n", "<leader>am", "<cmd>TSToolsAddMissingImports<CR>", opts)
        vim.keymap.set("n", "<leader>fa", "<cmd>TSToolsFixAll<CR>", opts)
        vim.keymap.set("n", "<leader>rf", "<cmd>TSToolsRenameFile<CR>", opts)
        vim.keymap.set("n", "<leader>gi", "<cmd>TSToolsGoToSourceDefinition<CR>", opts)
      end,
      settings = {
        separate_diagnostic_server = true,
        composite_mode = "separate_diagnostic",
        publish_diagnostic_on = "insert_leave",
        tsserver_max_memory = 8192,
        -- tsserver_logs = "verbose",
        tsserver_file_preferences = {
          importModuleSpecifierPreference = "non-relative",
        },
        tsserver_plugins = {},
        -- Exclude heavy directories from tsserver
        complete_function_calls = false, -- Can be slow in large codebases
      },
    })
  end,
}
