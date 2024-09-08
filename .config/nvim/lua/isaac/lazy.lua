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
    "github/copilot.vim",
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
