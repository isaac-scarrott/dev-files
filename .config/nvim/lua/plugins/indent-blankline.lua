return {
  "lukas-reineke/indent-blankline.nvim",
  event = { "BufReadPost", "BufNewFile" },
  config = function()
    local identblankline = require("ibl")

    identblankline.setup({
      whitespace = {
        highlight = "IndentBlanklineSpaceChar",
      },
      scope = {
        show_start = true,
      },
    })
  end,
}
