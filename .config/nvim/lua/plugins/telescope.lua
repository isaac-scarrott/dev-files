return {
  {
    "nvim-telescope/telescope-ui-select.nvim",
  },
  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
      { "BurntSushi/ripgrep" },
      { "nvim-lua/plenary.nvim" },
    },
    keys = {
      { "<leader>ff", ":Telescope find_files<CR>" },
      { "<leader>fs", ":Telescope live_grep<CR>" },
      { "<leader>fb", ":Telescope buffers<CR>" },
      { "<leader>fr", ":Telescope resume<CR>" },
    },
    config = function()
      local actions = require("telescope.actions")
      local telescope = require("telescope")

      telescope.setup({

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
        ["ui-select"] = {
          require("telescope.themes").get_dropdown({}),
        },
      })

      require("telescope").load_extension("ui-select")
      telescope.load_extension("fzf")
    end,
  },
}
