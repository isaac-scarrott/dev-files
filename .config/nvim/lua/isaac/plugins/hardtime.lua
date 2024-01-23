-- import hardtime safely
local setup, hardtime = pcall(require, "hardtime")
if not setup then
	return
end

-- configure/enable hardtime
hardtime.setup({
	restricted_keys = {
		["<C-N>"] = {},
	},
})
