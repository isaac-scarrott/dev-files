-- Auto-open nvim-tree only when launched on a directory (`nvim .`). Defers the
-- tree-api require off the startup critical path; opening a file goes straight
-- to the buffer with no tree load.
vim.api.nvim_create_autocmd("VimEnter", {
  callback = function(data)
    if vim.fn.isdirectory(data.file) ~= 1 then
      return
    end
    vim.cmd.cd(data.file)
    vim.schedule(function()
      require("nvim-tree.api").tree.open()
    end)
  end,
})

vim.api.nvim_create_autocmd("TextYankPost", {
  callback = function()
    vim.highlight.on_yank()
  end,
})

-- ESLint auto-fix on save for JS/TS files.
-- Runs the LSP "source.fixAll.eslint" code action synchronously so it completes
-- BEFORE conform.nvim's format_on_save (also on BufWritePre) runs prettierd —
-- otherwise the async EslintFixAll command races prettierd and clobbers fixes.
vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = { "*.js", "*.jsx", "*.ts", "*.tsx" },
  callback = function()
    local clients = vim.lsp.get_clients({ bufnr = 0, name = "eslint" })
    if #clients == 0 then
      return
    end
    local params = vim.lsp.util.make_range_params(0, clients[1].offset_encoding or "utf-16")
    params.context = { only = { "source.fixAll.eslint" }, diagnostics = {} }
    local results = vim.lsp.buf_request_sync(0, "textDocument/codeAction", params, 1000)
    for _, res in pairs(results or {}) do
      for _, action in pairs(res.result or {}) do
        if action.edit then
          vim.lsp.util.apply_workspace_edit(action.edit, clients[1].offset_encoding or "utf-16")
        end
      end
    end
  end,
})
