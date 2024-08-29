-- import nvim-tree plugin safely
local setup, neogit = pcall(require, "neogit")
if not setup then
	return
end
print("neogit loaded")

neogit.setup({
	kind = "split", -- opens neogit in a split
	signs = {
		-- { CLOSED, OPENED }
		section = { "", "" },
		item = { "", "" },
		hunk = { "", "" },
	},
	integrations = { diffview = true }, -- adds integration with diffview.nvim
})
