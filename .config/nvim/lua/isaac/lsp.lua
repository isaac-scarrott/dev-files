local builtin = require("telescope.builtin")

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

  lsp_map("n", "]d", function()
    vim.diagnostic.goto_next()
  end)
  lsp_map("n", "[d", function()
    vim.diagnostic.goto_prev()
  end)

  lsp_map("n", "<leader>D", vim.lsp.buf.type_definition)
  lsp_map({ "n", "x", "v" }, "<leader>ca", vim.lsp.buf.code_action)
  lsp_map("n", "<leader>e", vim.diagnostic.open_float)

  lsp_map("n", "<leader>co", function()
    builtin.lsp_document_symbols({
      symbols = {
        "Class",
        "Function",
        "Method",
        "Struct",
        "Interface",
      },
    })
  end)
end

return M
