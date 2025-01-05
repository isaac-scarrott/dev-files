local lazypath = vim.fn.stdpath("data") .. "/lazy/lazy.nvim"

if not (vim.uv or vim.loop).fs_stat(lazypath) then
  local lazyrepo = "https://github.com/folke/lazy.nvim.git"
  local out = vim.fn.system({ "git", "clone", "--filter=blob:none", "--branch=stable", lazyrepo, lazypath })
  if vim.v.shell_error ~= 0 then
    vim.api.nvim_echo({
      { "Failed to clone lazy.nvim:\n", "ErrorMsg" },
      { out, "WarningMsg" },
      { "\nPress any key to exit..." },
    }, true, {})
    vim.fn.getchar()
    os.exit(1)
  end
end

vim.opt.rtp:prepend(lazypath)

require("lazy").setup({
  spec = {
    -- START COMMON --
    { "christoomey/vim-tmux-navigator", lazy = false },
    "nvim-lua/plenary.nvim",
    "BurntSushi/ripgrep",
    -- {
    --   "github/copilot.vim",
    --   event = "InsertEnter",
    -- },
    {
      "olimorris/codecompanion.nvim",
      dependencies = {
        "nvim-lua/plenary.nvim",
        "nvim-treesitter/nvim-treesitter",
        "hrsh7th/nvim-cmp", -- Optional: For using slash commands and variables in the chat buffer
        "nvim-telescope/telescope.nvim", -- Optional: For using slash commands
        { "stevearc/dressing.nvim", opts = {} }, -- Optional: Improves the default Neovim UI
      },
      config = true,
    },
    "ggandor/lightspeed.nvim",
    -- { "vim-scripts/ReplaceWithRegister", lazy = false },
    -- END COMMON --

    -- START VISUALS --
    {
      "rebelot/kanagawa.nvim",
      lazy = false,
      priority = 1000,
      config = function()
        vim.cmd.colorscheme("kanagawa")
      end,
    },
    -- END VISUALS --

    { import = "plugins" },
  },
  defaults = {
    lazy = false,
  },
})
