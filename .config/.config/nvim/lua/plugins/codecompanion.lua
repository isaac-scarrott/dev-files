return {
  "olimorris/codecompanion.nvim",
  event = "VeryLazy",
  dependencies = {
    "nvim-lua/plenary.nvim",
    "nvim-treesitter/nvim-treesitter",
    "hrsh7th/nvim-cmp",
    "nvim-telescope/telescope.nvim",
    { "github/copilot.vim", cmd = "Copilot" },
  },
  keys = {
    { "<leader>cm", ":CodeCompanion /commit<CR>", desc = "Run CodeCompanion commit" },
  },
  config = function()
    require("codecompanion").setup({
      strategies = {
        chat = {
          adapter = "copilot",
        },
        inline = {
          adapter = "copilot",
        },
        agent = {
          adapter = "copilot",
        },
      },
      adapters = {
        copilot = function()
          return require("codecompanion.adapters").extend("copilot", {})
        end,
      },
      prompt_library = {
        ["Generate a Commit Message"] = {
          strategy = "chat",
          description = "Generate a commit message",
          opts = {
            index = 10,
            is_default = true,
            is_slash_cmd = true,
            short_name = "commit",
            auto_submit = true,
          },
          prompts = {
            {
              role = "user",
              content = function()
                local branch_name =
                  vim.fn.system("git rev-parse --abbrev-ref HEAD"):gsub("%s+", ""):match("^[^-]+%-[^-]+")
                local diff = vim.fn.system("git diff --no-ext-diff --staged")
                if branch_name and branch_name ~= "" then
                  return string.format(
                    [[Review the following git diff and generate an objective commit message that clearly describes the changes made. The commit message should be factual and free of opinions.. The commit message should include the branch name in the format "[%s] <commit message>":
```diff
%s
```
]],
                    branch_name,
                    diff
                  )
                else
                  return string.format(
                    [[Review the following git diff and generate an objective commit message that clearly describes the changes made. The commit message should be factual and free of opinions. The commit message should not include the branch name:
```diff
%s
```
]],
                    diff
                  )
                end
              end,
              opts = {
                contains_code = true,
              },
            },
          },
        },

        ["Pull Request Description"] = {
          strategy = "chat",
          description = "Generate a Pull Request message description",
          opts = {
            index = 18,
            is_default = true,
            short_name = "pr",
            is_slash_cmd = true,
            auto_submit = true,
          },
          prompts = {
            {
              role = "user",
              contains_code = true,
              content = function()
                return "You are an expert at writing detailed and clear pull request descriptions."
                  .. "Please create a pull request message following standard convention from the provided diff changes."
                  .. "Ensure the title, description, type of change, and additional notes sections are well-structured and informative."
                  .. "\n\n```diff\n"
                  .. vim.fn.system("git diff $(git merge-base HEAD main)...HEAD")
                  .. "\n```"
              end,
            },
          },
        },
      },
    })
  end,
}
