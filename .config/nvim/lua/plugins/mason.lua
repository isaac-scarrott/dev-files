return {
  "williamboman/mason.nvim",
  dependencies = {
    "williamboman/mason-lspconfig.nvim",
    "WhoIsSethDaniel/mason-tool-installer.nvim",
  },
  cmd = "Mason",
  lazy = true,

  config = function()
    local mason_lspconfig = require("mason-lspconfig")
    local tool_installer = require("mason-tool-installer")

    require("mason").setup({})

    -- Advertise blink.cmp's completion capabilities to every LSP server so they
    -- enable snippet support, additional resolve fields, etc. Must run before
    -- mason-lspconfig.setup() since that resolves and enables servers.
    vim.lsp.config("*", {
      capabilities = require("blink.cmp").get_lsp_capabilities(),
    })

    -- Configure individual servers via vim.lsp.config() BEFORE mason-lspconfig.setup()
    -- runs, since automatic_enable resolves settings at enable-time. Putting these
    -- after setup() leaves them silently inert.
    -- eslint: disable formatting (handled by prettierd via conform.nvim)
    vim.lsp.config("eslint", {
      on_attach = function(client, bufnr)
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false
      end,
    })

    -- vtsls: own TS LSP. Formatting handled by prettierd via conform.nvim.
    -- importModuleSpecifierPreference is intentionally NOT set here — projects
    -- with path aliases should opt in via a local .nvim.lua exrc.
    vim.lsp.config("vtsls", {
      on_attach = function(client, bufnr)
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false
      end,
      settings = {
        typescript = {
          tsserver = { maxTsServerMemory = 8192 },
          suggest = { completeFunctionCalls = false },
        },
        javascript = {
          suggest = { completeFunctionCalls = false },
        },
      },
    })

    -- ruff: Python LSP for diagnostics + organize-imports code actions.
    -- Formatting is handled by conform (ruff_format) — disable here.
    vim.lsp.config("ruff", {
      on_attach = function(client, _)
        client.server_capabilities.documentFormattingProvider = false
        client.server_capabilities.documentRangeFormattingProvider = false
      end,
    })

    -- pyright: Python type checking. Defers Python linting to ruff via the
    -- usual diagnostic source separation.
    vim.lsp.config("pyright", {
      settings = {
        pyright = { disableOrganizeImports = true },
        python = { analysis = { typeCheckingMode = "basic" } },
      },
    })

    -- graphql: only attach in projects that actually use GraphQL. The default
    -- root_dir function calls on_dir(nil) when no .graphqlrc is found, which
    -- still enables the server in single-file mode. Override to skip enabling
    -- entirely when no graphql config is present. schema.graphql is added so
    -- holibob (which keeps the schema at repo root) gets the LSP.
    local graphql_markers = {
      ".graphqlrc",
      ".graphqlrc.json",
      ".graphqlrc.yaml",
      ".graphqlrc.yml",
      ".graphqlrc.js",
      ".graphqlrc.ts",
      "graphql.config.js",
      "graphql.config.ts",
      "graphql.config.json",
      "graphql.config.yaml",
      "graphql.config.yml",
      "schema.graphql",
    }
    vim.lsp.config("graphql", {
      root_dir = function(bufnr, on_dir)
        local fname = vim.api.nvim_buf_get_name(bufnr)
        local root = vim.fs.root(fname, graphql_markers)
        if root then
          on_dir(root)
        end
      end,
    })

    local ensure_installed = {
      "lua_ls",
      "eslint",
      "vtsls",
      "tailwindcss",
      "graphql",
      "astro",
      "pyright",
      "ruff",
    }

    mason_lspconfig.setup({
      ensure_installed = ensure_installed,
      -- Enable ONLY the servers in our list, even if other mason packages are
      -- installed (e.g. leftover svelte/gopls/stylelint/copilot-language-server
      -- from prior configs). Setting `true` would auto-enable every installed
      -- mason package and duplicate work (copilot LSP vs copilot.lua) or attach
      -- LSPs we no longer want.
      automatic_enable = ensure_installed,
    })

    tool_installer.setup({
      ensure_installed = {
        -- Linters
        "luacheck",
        -- Formatters
        "prettierd",
        "stylua",
      },
    })

    tool_installer.run_on_start()
  end,
}
