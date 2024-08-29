-- import gitsigns plugin safely
local setup, gitblame = pcall(require, "gitblame")
if not setup then
	return
end

-- configure/enable gitsigns
gitblame.setup({
	enable = false,
})
