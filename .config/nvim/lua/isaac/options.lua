local opt = vim.opt

vim.g.mapleader = " "

-- line numbers
-- opt.relativenumber = true
-- opt.number = true

--tabs & indentation
opt.tabstop = 2
opt.shiftwidth = 2
opt.expandtab = true
opt.autoindent = true
opt.smartindent = true

-- line wrapping
opt.wrap = false

-- search settings
opt.ignorecase = true
opt.smartcase = true
opt.incsearch = true

-- cusor line
opt.cursorline = true

--appearance
opt.termguicolors = true
opt.background = "dark"
opt.signcolumn = "yes"

--backspace
opt.backspace = "indent,eol,start"

-- scroll
opt.scrolloff = 8

--clipboard
opt.clipboard:append("unnamedplus")

-- split windows
opt.splitright = true
opt.splitbelow = true

opt.iskeyword:append("-")

-- LSP performance
vim.lsp.set_log_level("off") -- Disable LSP logging (set to "debug" when troubleshooting)
opt.updatetime = 250 -- Faster CursorHold events (default 4000ms)
