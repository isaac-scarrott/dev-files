local ensure_packer = function()
	local fn = vim.fn
	local install_path = fn.stdpath("data") .. "/site/pack/packer/start/packer.nvim"
	if fn.empty(fn.glob(install_path)) > 0 then
		fn.system({ "git", "clone", "--depth", "1", "https://github.com/wbthomason/packer.nvim", install_path })
		vim.cmd([[packadd packer.nvim]])
		return true
	end
	return false
end
local packer_bootstrap = ensure_packer() -- true if packer was just installed

-- autocommand that reloads neovim and installs/updates/removes plugins
-- when file is saved
vim.cmd([[
  augroup packer_user_config
    autocmd!
    autocmd BufWritePost plugins.lua source <afile> | PackerCompile
  augroup end
]])

-- import packer safely
local status, packer = pcall(require, "packer")
if not status then
	return
end

-- add list of plugins to install
return packer.startup(function(use)
	-- packer can manage itself
	use("wbthomason/packer.nvim")

	use("nvim-lua/plenary.nvim")
	use("BurntSushi/ripgrep")

	use("rebelot/kanagawa.nvim") -- colorscheme

	use("christoomey/vim-tmux-navigator") -- tnux & split window navigation

	use("szw/vim-maximizer") -- maximizes and restores current window

	use("tpope/vim-surround") -- surround text objects with quotes, parens, etc...
	use("vim-scripts/ReplaceWithRegister") -- replace text with contents of register

	use("numToStr/Comment.nvim") -- comment lines

	use("nvim-lualine/lualine.nvim") -- status line

	use({
		"nvim-tree/nvim-tree.lua", -- file explorer
		requires = {
			"nvim-tree/nvim-web-devicons",
		},
	})

	-- fuzzy finding w/ telescope
	use({ "nvim-telescope/telescope-fzf-native.nvim", run = "make" }) -- dependency for better sorting performance
	use({ "nvim-telescope/telescope.nvim", branch = "0.1.x" }) -- fuzzy finder
	use({ "LukasPietzschmann/telescope-tabs", requires = { "nvim-telescope/telescope.nvim" } }) -- fuzzy finder for tabs

	-- autocompletion
	use("hrsh7th/nvim-cmp") -- completion plugin
	use("hrsh7th/cmp-buffer") -- source for text in buffer
	use("hrsh7th/cmp-path") -- source for file system paths

	-- snippets
	use("L3MON4D3/LuaSnip") -- snippet engine
	use("saadparwaiz1/cmp_luasnip") -- for autocompletion
	use("rafamadriz/friendly-snippets") -- useful snippets

	-- managing & installing lsp servers, linters & formatters
	use("williamboman/mason.nvim") -- in charge of managing lsp servers, linters & formatters
	use("williamboman/mason-lspconfig.nvim") -- bridges gap b/w mason & lspconfig

	-- configuring lsp servers
	use("neovim/nvim-lspconfig") -- easily configure language servers
	use("hrsh7th/cmp-nvim-lsp") -- for autocompletion
	use({
		"glepnir/lspsaga.nvim",
		branch = "main",
		commit = "4f075452c466df263e69ae142f6659dcf9324bf6",
		requires = {
			{ "nvim-tree/nvim-web-devicons" },
			{ "nvim-treesitter/nvim-treesitter" },
		},
	}) -- enhanced lsp uis
	use("jose-elias-alvarez/typescript.nvim") -- additional functionality for typescript server (e.g. rename file & update imports)
	use("simrat39/rust-tools.nvim") -- additional functionality for rust server (e.g. run cargo commands)
	use("onsails/lspkind.nvim") -- vs-code like icons for autocompletion

	-- formatting & linting
	use("jose-elias-alvarez/null-ls.nvim") -- configure formatters & linters
	use("jayp0521/mason-null-ls.nvim") -- bridges gap b/w mason & null-ls

	-- treesitter configuration
	use({
		"nvim-treesitter/nvim-treesitter",
		run = function()
			local ts_update = require("nvim-treesitter.install").update({ with_sync = true })
			ts_update()
		end,
	})

	-- auto closing
	use("windwp/nvim-autopairs") -- autoclose parens, brackets, quotes, etc...
	use({ "windwp/nvim-ts-autotag", after = "nvim-treesitter" }) -- autoclose tags

	-- git integration
	use("lewis6991/gitsigns.nvim") -- show line modifications on left hand side
	use({ "NeogitOrg/neogit", requires = "nvim-lua/plenary.nvim" })
	use("tpope/vim-fugitive")

	use("github/copilot.vim")

	use({ "ggandor/lightspeed.nvim" })

	use("lukas-reineke/indent-blankline.nvim")

	-- encourage good habits
	use({
		"m4xshen/hardtime.nvim",
		requires = { "MunifTanjim/nui.nvim", "nvim-lua/plenary.nvim" },
	})

	if packer_bootstrap then
		require("packer").sync()
	end
end)
