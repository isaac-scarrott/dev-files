return {
  "neovim/nvim-lspconfig",
  dependencies = {
    -- mason owns its own spec (lua/plugins/mason.lua); declaring it here just
    -- guarantees load order so mason-lspconfig.setup() runs before lspconfig
    -- expects servers to be enabled.
    "williamboman/mason.nvim",
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
  event = { "BufReadPost", "BufNewFile" },
  config = function()
    local lsp = require("isaac.lsp")
    local utils = require("isaac.utils")

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
