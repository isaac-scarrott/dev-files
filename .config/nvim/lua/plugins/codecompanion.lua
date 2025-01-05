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
        ["Code Review Workflow"] = {
          strategy = "workflow",
          description = "Comprehensive code review workflow checking GraphQL schemas, React best practices, and general code quality",
          opts = {
            index = 1,
          },
          prompts = {
            {
              {
                role = "system",
                content = [[You are a GraphQL schema reviewer who strictly checks schemas against both official specifications and internal standards. You only report violations, never positive feedback. You format your responses as [line_number] - Violation description - How to fix.
Only review changes in the diff, not the entire schema.]],
                opts = {
                  visible = false,
                  auto_submit = true,
                },
              },
              {
                role = "user",
                content = function()
                  -- Try to get diff against main, fallback to master if main doesn't exist
                  local base_branch =
                    vim.fn.system("git rev-parse --verify main >/dev/null 2>&1 && echo main || echo master")
                  base_branch = base_branch:gsub("%s+", "") -- Remove whitespace/newlines

                  -- Get only the schema changes from the diff
                  local diff = vim.fn.system(string.format([[git diff %s...HEAD -- "**/schema.graphql"]], base_branch))

                  return [[Check these schema changes against the official GraphQL specification (June 2018):

1. Naming (Section 3.8):
   - Type names must be PascalCase
   - Field and argument names must be camelCase
   - Enum values must be ALL_CAPS
   
2. Type System (Section 3):
   - Objects must not implement themselves
   - Interface implementations must include all fields
   - Union types must include at least one type
   - Input object fields cannot be of type union, interface, or subscription

3. Schema Structure:
   - Root types must be Object types
   - Directives must be declared before use
   - Field names in an object type must be unique
   - Argument names must be unique per field

4. Values and Types (Section 3.5):
   - Default values must be compatible with input types
   - List/Non-Null wrapping must be valid
   - Scalars must use correct literal formats

```diff
]] .. diff .. [[
```]]
                end,
                opts = {
                  auto_submit = true,
                },
              },
            },
            {
              {
                role = "user",
                content = function()
                  -- Use same diff from above
                  local base_branch =
                    vim.fn.system("git rev-parse --verify main >/dev/null 2>&1 && echo main || echo master")
                  base_branch = base_branch:gsub("%s+", "")
                  local diff = vim.fn.system(string.format([[git diff %s...HEAD -- "**/schema.graphql"]], base_branch))

                  return [[Check these schema changes against our internal specifications:

1. Naming Conventions:
   - Use 'List' suffix instead of plurals (e.g., 'UserList' not 'Users')
   - All mutation names must start with a verb (e.g., 'createUser', not 'userCreate')
   - All query field names must be nouns
   - Use 'Input' suffix for all input types

2. Type Structure:
   - All mutations must return a union type of Success or Error
   - Every object type must have an 'id' field of type ID!
   - No nested nullables (e.g., [String!]! is valid, [String]! is not)
   - Maximum field arguments is 3, use input types for more

3. Documentation:
   - Every type must have a description
   - Every field with arguments must have a description
   - Every enum value must have a description

```diff
]] .. diff .. [[
```]]
                end,
                opts = {
                  auto_submit = true,
                },
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
