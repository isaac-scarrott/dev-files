local builtin = require("telescope.builtin")

local M = {}

local function ts_code_action(kind)
  return function()
    vim.lsp.buf.code_action({
      apply = true,
      context = { only = { kind }, diagnostics = {} },
    })
  end
end

function M.on_attach(client, bufnr)
  local function lsp_map(mode, lhs, rhs)
    vim.keymap.set(mode, lhs, rhs, { buffer = bufnr })
  end

  lsp_map("n", "gd", "<cmd>Telescope lsp_definitions<CR>")
  lsp_map("n", "gr", "<cmd>Telescope lsp_references<CR>")

  lsp_map("n", "K", function()
    vim.lsp.buf.hover({ border = "rounded" })
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

  if client and client.name == "vtsls" then
    lsp_map("n", "<leader>oi", ts_code_action("source.organizeImports"))
    lsp_map("n", "<leader>ru", ts_code_action("source.removeUnused.ts"))
    lsp_map("n", "<leader>am", ts_code_action("source.addMissingImports.ts"))
    lsp_map("n", "<leader>fa", ts_code_action("source.fixAll.ts"))
    lsp_map("n", "<leader>rf", function()
      client:exec_cmd({
        command = "typescript.renameFile",
        arguments = { vim.uri_from_bufnr(bufnr) },
      })
    end)
    lsp_map("n", "<leader>gi", function()
      local params = vim.lsp.util.make_position_params(0, client.offset_encoding or "utf-16")
      client:exec_cmd({
        command = "typescript.goToSourceDefinition",
        arguments = { params.textDocument.uri, params.position },
      })
    end)
  end
end

return M
