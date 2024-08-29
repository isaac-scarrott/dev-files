-- import telescope plugin safely
local telescope_setup, telescope = pcall(require, "telescope")
if not telescope_setup then
	return
end

-- import telescope actions safely
local actions_setup, actions = pcall(require, "telescope.actions")
if not actions_setup then
	return
end

-- import telescope actions safely
local tabs_setup, tabs = pcall(require, "telescope-tabs")
if not tabs_setup then
	return
end

-- configure telescope
telescope.setup({
	-- configure custom mappings
	defaults = {
		mappings = {
			i = {
				["<C-k>"] = actions.move_selection_previous, -- move to prev result
				["<C-j>"] = actions.move_selection_next, -- move to next result
				["<C-q>"] = actions.send_selected_to_qflist + actions.open_qflist, -- send selected to quickfixlist
				["<CR>"] = actions.select_default + actions.center,
			},

			n = {
				["<CR>"] = actions.select_default + actions.center,
			},
		},
	},
})

telescope.load_extension("fzf")
telescope.load_extension("ui-select")
tabs.setup({})
