vim.g.mapleader = " "

local keymap = vim.keymap

---------------------
-- General Keymaps
---------------------

-- clear search highlights
keymap.set("n", "<leader>nh", ":nohl<CR>")

-- use jk to exit insert mode
keymap.set("i", "jk", "<ESC>")

-- navigation
keymap.set("n", "<C-d>", "<C-d>zz")
keymap.set("n", "<C-u>", "<C-u>zz")

-- window management
keymap.set("n", "<leader>sv", "<C-w>v") -- split window vertically
keymap.set("n", "<leader>sh", "<C-w>s") -- split window horizontally
keymap.set("n", "<leader>sx", ":close<CR>") -- close current split window

keymap.set("n", "<leader>to", ":tabnew<CR>") -- open new tab
keymap.set("n", "<leader>tx", ":tabclose<CR>") -- close current tab
keymap.set("n", "<leader>tn", ":tabn<CR>") --  go to next tab
keymap.set("n", "<leader>tp", ":tabp<CR>") --  go to previous tab

-- move highlighted line(s) up or down
vim.keymap.set("v", "J", ":m '>+1<CR>gv=gv")
vim.keymap.set("v", "K", ":m '<-2<CR>gv=gv")

-- rename current word
vim.keymap.set("n", "<leader>rw", [[:%s/\<<C-r><C-w>\>//gI<Left><Left><Left>]])

-- delete without saving to a register
keymap.set("n", "<leader>dw", '"_dw') -- delete word without saving to a register
keymap.set("n", "<leader>d$", '"_d$') -- delete to the end of line without saving to a register
keymap.set("n", "<leader>dd", '"_dd') -- delete line without saving to a register
keymap.set("x", "<leader>p", [["_dP]]) -- paste over selected text without saving to a register

-- plugin keymaps
--
-- vim-maximizer
keymap.set("n", "<leader>sm", ":MaximizerToggle<CR>")

-- tree
vim.keymap.set("n", "<C-n>", vim.cmd.NvimTreeToggle)

-- telescope
keymap.set("n", "<leader>ff", "<cmd>Telescope find_files<cr>") -- find files within current working directory, respects .gitignore
keymap.set("n", "<leader>fs", "<cmd>Telescope live_grep<cr>") -- find string in current working directory as you type
keymap.set("n", "<leader>fb", "<cmd>Telescope buffers<cr>") -- list open buffers in current neovim instance
keymap.set("n", "<leader>fr", "<cmd>Telescope resume<cr>") -- resume the previous telescope search
keymap.set("n", "<leader>ft", "<cmd>Telescope telescope-tabs list_tabs<cr>") -- search help tags

-- neogit
keymap.set("n", "<leader>gs", "<cmd>Neogit kind=split<cr>") -- open neogit in a split window

-- git fugitive
keymap.set("n", "<leader>ds", ":Gvdiffsplit!<CR>") -- open git diff in a split window
