local keymap = vim.keymap

-- clear search highlights
keymap.set("n", "<leader>nh", ":nohl<CR>")

-- navigation
keymap.set("n", "<C-d>", "<C-d>zz")
keymap.set("n", "<C-u>", "<C-u>zz")

-- window management
keymap.set("n", "<leader>sv", "<C-w>v") -- split window vertically
keymap.set("n", "<leader>sh", "<C-w>s") -- split window horizontally
keymap.set("n", "<leader>sx", ":close<CR>") -- close current split window

-- move highlighted line(s) up or down
keymap.set("v", "J", ":m '>+1<CR>gv=gv")
keymap.set("v", "K", ":m '<-2<CR>gv=gv")

-- rename current word
vim.keymap.set("n", "<leader>rw", [[:%s/\<<C-r><C-w>\>//gI<Left><Left><Left>]])

vim.keymap.set("v", "<leader>cl", function()
  -- Yank the visual selection
  local original_register = vim.fn.getreg('"')
  vim.cmd('normal! "vy')
  local selected_text = vim.fn.getreg('"')

  -- Remove surrounding whitespace and sanitize variable name
  selected_text = vim.trim(selected_text)

  -- Create a JavaScript object and prettify it with JSON.stringify
  local log_statement = "console.log(JSON.stringify({ " .. selected_text .. " }, null, 2));"

  -- Insert the log statement after the selected text
  vim.api.nvim_put({ log_statement }, "l", true, true)

  -- Restore the original register to avoid affecting yanking behavior
  vim.fn.setreg('"', original_register)
end, { noremap = true, silent = true })

vim.keymap.set("n", "<leader>cl", function()
  -- Get the current word under the cursor (capital W includes punctuation)
  local current_word = vim.fn.expand("<cWORD>")

  -- Trim any surrounding whitespace
  current_word = vim.trim(current_word)

  -- Create a JavaScript object and prettify it with JSON.stringify
  local log_statement = "console.log(JSON.stringify({ " .. current_word .. " }, null, 2));"

  -- Insert the log statement after the current line
  vim.api.nvim_put({ log_statement }, "l", true, true)
end, { noremap = true, silent = true })
