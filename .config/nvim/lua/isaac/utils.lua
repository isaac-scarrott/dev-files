local PACKAGE_JSON = "package.json"

local M = {}

function P(arg)
  print(vim.inspect(arg))
end

local isaacGroup = vim.api.nvim_create_augroup("IsaacGroup", { clear = true })

M.config_autocmd = function(event, opts)
  vim.api.nvim_create_autocmd(event, vim.tbl_extend("force", opts, { group = isaacGroup }))
end

M.resize_split_by = function(size, opts)
  opts = opts or { add = true }

  local mul = opts.add and 1 or -1
  local width = vim.api.nvim_win_get_width(0)

  vim.api.nvim_win_set_width(0, width + size * mul)
end

M.is_npm_installed = function(package)
  local file_path = vim.api.nvim_buf_get_name(0)

  if file_path == "" or file_path == nil then
    file_path = vim.fn.getcwd()
  end

  -- Use vim.fs.root (Nvim 0.10+) to find package.json
  local root = vim.fs.root(file_path, { PACKAGE_JSON })
  if root then
    local content = table.concat(vim.fn.readfile(root .. "/" .. PACKAGE_JSON, "\n"))
    local ok, json_content = pcall(vim.json.decode, content)

    if ok and json_content.dependencies and json_content.dependencies[package] then
      return true
    end

    if ok and json_content.devDependencies and json_content.devDependencies[package] then
      return true
    end
  end

  return false
end

return M
