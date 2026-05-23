return {
  "echasnovski/mini.nvim",
  event = "VeryLazy",
  config = function()
    local clue = require("mini.clue")
    clue.setup({
      triggers = {
        { mode = "n", keys = "<Leader>" },
        { mode = "x", keys = "<Leader>" },
        { mode = "n", keys = "g" },
        { mode = "n", keys = "[" },
        { mode = "n", keys = "]" },
        { mode = "n", keys = "<C-w>" },
      },
      clues = {
        clue.gen_clues.builtin_completion(),
        clue.gen_clues.g(),
        clue.gen_clues.marks(),
        clue.gen_clues.registers(),
        clue.gen_clues.windows(),
        clue.gen_clues.z(),
        { mode = "n", keys = "<Leader>f", desc = "+find" },
        { mode = "n", keys = "<Leader>g", desc = "+git" },
        { mode = "n", keys = "<Leader>s", desc = "+split" },
        { mode = "n", keys = "<Leader>r", desc = "+rename/refactor" },
        { mode = "n", keys = "<Leader>c", desc = "+code" },
      },
      window = { delay = 300 },
    })

    require("mini.statusline").setup({ use_icons = true })
  end,
}
