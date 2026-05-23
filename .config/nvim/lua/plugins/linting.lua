local linters_by_ft = {
  -- ESLint diagnostics handled by ESLint LSP, no need for eslint_d here.
  -- Python diagnostics handled by ruff LSP, no need for ruff/pylint here.
  lua = { "luacheck" },
}

--- Check if a linter is available (executable exists)
---@param linter string
---@return boolean
local function linter_available(linter)
  return vim.fn.executable(linter) == 1
end

--- Filter linters to only those that are installed
---@param linters string[]
---@return string[]
local function filter_available_linters(linters)
  return vim.tbl_filter(linter_available, linters)
end

return {
  "mfussenegger/nvim-lint",
  event = { "BufReadPre", "BufNewFile" },
  config = function()
    local lint = require("lint")

    -- Clear all default linters first to prevent errors from missing tools
    lint.linters_by_ft = {}

    -- Only register linters that are actually installed
    for ft, linters in pairs(linters_by_ft) do
      lint.linters_by_ft[ft] = filter_available_linters(linters)
    end

    local lint_augroup = vim.api.nvim_create_augroup("lint", { clear = true })

    vim.api.nvim_create_autocmd({ "BufWritePost", "InsertLeave" }, {
      group = lint_augroup,
      callback = function()
        lint.try_lint()
      end,
    })

    vim.keymap.set("n", "<leader>l", function()
      lint.try_lint()
    end, { desc = "Trigger linting for current file" })
  end,
}
