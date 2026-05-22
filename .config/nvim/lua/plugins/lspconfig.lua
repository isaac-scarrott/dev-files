return {
  "neovim/nvim-lspconfig",
  dependencies = {
    "j-hui/fidget.nvim",
    {
      "folke/lazydev.nvim",
      ft = "lua",
      opts = {
        library = {
          { path = "${3rd}/luv/library", words = { "vim%.uv" } },
        },
      },
    },
  },
  event = "BufReadPre",
  config = function()
    local lsp = require("isaac.lsp")
    local utils = require("isaac.utils")

    -- Configure global LSP defaults via vim.lsp.config('*', ...)
    vim.lsp.config("*", {
      handlers = lsp.handlers,
    })

    utils.config_autocmd("LspAttach", {
      callback = function(e)
        local client = vim.lsp.get_client_by_id(e.data.client_id)

        if not client then
          return
        end

        lsp.on_attach(client, e.buf)
      end,
    })

    require("fidget").setup({
      progress = {
        display = { progress_icon = { "moon" } },
      },
    })
  end,
}
