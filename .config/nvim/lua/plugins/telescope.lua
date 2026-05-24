return {

  {
    "nvim-telescope/telescope.nvim",
    dependencies = {
      { "nvim-telescope/telescope-fzf-native.nvim", build = "make" },
      { "nvim-lua/plenary.nvim" },
    },
    keys = {
      { "<leader>ff", ":Telescope find_files<CR>" },
      { "<leader>fs", ":Telescope live_grep<CR>" },
      { "<leader>fb", ":Telescope buffers<CR>" },
      { "<leader>fr", ":Telescope resume<CR>" },
      { "<leader>gb", ":Telescope git_branches<CR>" },
      { "<leader>gs", ":Telescope git_status<CR>" },
      { "<leader>gc", ":Telescope git_commits<CR>" },
      { "<leader>gB", ":Telescope git_bcommits<CR>" },
    },
    config = function()
      local actions = require("telescope.actions")
      local layout_actions = require("telescope.actions.layout")
      local telescope = require("telescope")

      telescope.setup({

        defaults = {
          -- Pickers open without the previewer pane so they paint instantly;
          -- previewer is on-demand via <C-p>. For lsp_references on a large
          -- monorepo this is the difference between a snappy list and waiting
          -- for tsserver + previewer file load.
          preview = { hide_on_startup = true },
          -- Use ripgrep for live_grep (respects .gitignore, very fast)
          vimgrep_arguments = {
            "rg",
            "--color=never",
            "--no-heading",
            "--with-filename",
            "--line-number",
            "--column",
            "--smart-case",
            "--hidden",
            "--glob=!.git/",
          },
          mappings = {
            i = {
              ["<C-k>"] = actions.move_selection_previous, -- move to prev result
              ["<C-j>"] = actions.move_selection_next, -- move to next result
              ["<C-q>"] = actions.send_selected_to_qflist + actions.open_qflist, -- send selected to quickfixlist
              ["<C-p>"] = layout_actions.toggle_preview, -- show/hide previewer
              ["<CR>"] = actions.select_default + actions.center,
            },

            n = {
              ["<C-p>"] = layout_actions.toggle_preview,
              ["<CR>"] = actions.select_default + actions.center,
            },
          },
          -- Lua patterns (not globs). `.` means any char, so `.git/` would
          -- match `/git/` anywhere — including the user's home `~/git/`,
          -- silently wiping every Telescope LSP result. Escape the dot.
          file_ignore_patterns = { "node_modules", "%.git/", "%.lock" },
          path_display = { "truncate" },
        },
        pickers = {
          find_files = {
            -- Use ripgrep for find_files (fastest, respects .gitignore)
            find_command = { "rg", "--files", "--hidden", "--glob", "!.git/" },
            -- Disable previewer for faster initial load
            previewer = false,
          },
          live_grep = {
            -- Additional ripgrep arguments for live_grep
            additional_args = function()
              return { "--hidden", "--glob=!.git/" }
            end,
          },
        },
      })

      telescope.load_extension("fzf")
    end,
  },
}
