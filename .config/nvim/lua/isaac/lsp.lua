local builtin = require("telescope.builtin")
local themes = require("telescope.themes")

local M = {}

M.handlers = {
  ["textDocument/hover"] = vim.lsp.with(vim.lsp.handlers.hover, {
    border = "rounded",
  }),
}

function M.on_attach(_, bufnr)
  local function lsp_map(mode, lhs, rhs)
    vim.keymap.set(mode, lhs, rhs, { buffer = bufnr })
  end

  lsp_map("n", "gd", "<cmd>Telescope lsp_definitions<CR>")
  lsp_map("n", "gr", "<cmd>Telescope lsp_references<CR>")

  lsp_map("n", "K", function()
    vim.lsp.buf.hover()
  end)

  lsp_map("n", "<leader>rn", function()
    vim.lsp.buf.rename()
  end)

  local function goto_next_and_fix()
    local opts = {}
    local direction = "next"

    local pos = vim.diagnostic[string.format("get_%s_pos", direction)](opts)

    if not pos then
      return print(
        string.format("Diagnostic%s: No more valid diagnostics to move to.", direction:gsub("^%l", string.upper))
      )
    end

    local win_id = opts.win_id or vim.api.nvim_get_current_win()

    vim.api.nvim_win_set_cursor(win_id, { pos[1] + 1, pos[2] })

    vim.lsp.buf.code_action()
  end

  local function goto_prev_and_fix()
    local opts = {}
    local direction = "prev"

    local pos = vim.diagnostic[string.format("get_%s_pos", direction)](opts)

    if not pos then
      return print(
        string.format("Diagnostic%s: No more valid diagnostics to move to.", direction:gsub("^%l", string.upper))
      )
    end

    local win_id = opts.win_id or vim.api.nvim_get_current_win()

    vim.api.nvim_win_set_cursor(win_id, { pos[1] + 1, pos[2] })

    vim.lsp.buf.code_action()
  end

  lsp_map("n", "]d", goto_next_and_fix)
  lsp_map("n", "[d", goto_prev_and_fix)

  lsp_map("n", "<leader>D", vim.lsp.buf.type_definition)
  lsp_map({ "n", "x", "v" }, "<leader>ca", vim.lsp.buf.code_action)
  lsp_map("n", "<leader>e", vim.diagnostic.open_float)
end

return M
