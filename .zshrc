export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="spaceship"
plugins=(z zsh-autosuggestions)
source $ZSH/oh-my-zsh.sh

# Neovim Aliases
alias vim="nvim"
alias vi="nvim"

alias DEEPSEEK_API_KEY="export DEEPSEEK_API_KEY=\$(op read op://private/DeepSeek_API/credential --no-newline)"
alias ANTHROPIC_API_KEY="export ANTHROPIC_API_KEY=\$(op read op://private/Anthropic_API/credential --no-newline)"
alias OPENAI_API_KEY="export OPENAI_API_KEY=\$(op read op://private/OpenAI_API/credential --no-newline)"
alias PERPLEXITY_API_KEY="export PERPLEXITY_API_KEY=\$(op read op://private/Perplexity_API/credential --no-newline)"
alias OPENROUTER_API_KEY="export OPENROUTER_API_KEY=\$(op read op://private/OpenRouter_API/credential --no-newline)"
alias GEMINI_API_KEY="export GEMINI_API_KEY=\$(op read op://private/GoogleAI_API/credential --no-newline)"

