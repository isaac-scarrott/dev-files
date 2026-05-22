local linters_by_ft = {
  -- ESLint diagnostics handled by ESLint LSP, no need for eslint_d here
  python = { "pylint" },
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
    local timer = vim.uv.new_timer()

    vim.api.nvim_create_autocmd({ "BufEnter", "BufWritePost", "InsertLeave", "TextChanged" }, {
      group = lint_augroup,
      callback = function()
        -- Debounce linting to avoid running on every keystroke
        timer:stop()
        timer:start(150, 0, vim.schedule_wrap(function()
          lint.try_lint()
        end))
      end,
    })

    vim.keymap.set("n", "<leader>l", function()
      lint.try_lint()
    end, { desc = "Trigger linting for current file" })
  end,
}
