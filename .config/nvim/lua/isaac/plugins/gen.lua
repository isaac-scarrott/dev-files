vim.keymap.set("n", "<leader>ai", ":Gen<CR>")
vim.keymap.set("v", "<leader>ai", ":Gen<CR>")

require("gen").setup({
	debug = true,
})
require("gen").prompts["Elaborate_Text"] = {
	prompt = "Elaborate the following text:\n$text",
	replace = true,
}

require("gen").prompts["Fix_Code"] = {
	prompt = "Fix the following code. Only ouput the result in format ```$filetype\n...\n```:\n```$filetype\n$text\n```",
	replace = true,
	extract = "```$filetype\n(.-)```",
}

require("gen").model = "zephyr"
