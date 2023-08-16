-- import gitsigns plugin safely
local setup, identblankline = pcall(require, "indent_blankline")
if not setup then
	return
end

-- configure/enable indent-blankline
identblankline.setup({
	space_char_blankline = " ",
	show_current_context = true,
	show_current_context_start = true,
})
