return {
  "sindrets/diffview.nvim",
  cmd = { "DiffviewOpen" },
  keys = function()
    return {
      { "gv", "<cmd>:DiffviewOpen<CR>", desc = "[g]it [v]iew diff" },
      { "gq", "<cmd>:DiffviewClose<CR>", desc = "[g]it diffview [q]uit" },
      { "gh", "<cmd>:DiffviewFileHistory %<CR>", desc = "[g]it file [h]istory" },
    }
  end,
  config = function()
    require("diffview").setup({
      file_panel = {
        win_config = {
          position = "right",
          width = 50,
        },
      },
    })
  end,
}
