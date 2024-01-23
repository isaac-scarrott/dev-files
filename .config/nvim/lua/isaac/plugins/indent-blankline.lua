-- import gitsigns plugin safely
local setup, identblankline = pcall(require, "ibl")
if not setup then
	return
end

-- configure/enable indent-blankline
identblankline.setup({
	whitespace = {
		highlight = "IndentBlanklineSpaceChar",
	},
	scope = {
		show_start = true,
	},
})
