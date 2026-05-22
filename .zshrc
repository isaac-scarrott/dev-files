export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="spaceship"
plugins=(z zsh-autosuggestions)
source $ZSH/oh-my-zsh.sh

# Neovim Aliases
alias vim="nvim"
alias vi="nvim"

export_credential() {
  # The first parameter is the credential ID in 1Password
  local cred_id="$1"
  # The second parameter is optional; default to cred_id if not provided
  local env_var="${2:-$1}"
  export "$env_var"="$(op read op://private/${cred_id}/credential --no-newline)"
}

alias CLOUDFLARE_API_TOKEN_TODO="export CLOUDFLARE_API_TOKEN=\$(op read op://private/CLOUDFLARE_API_TOKEN_TODO/credential --no-newline)"
alias CLOUDFLARE_API_TOKEN_ISAAC="export CLOUDFLARE_API_TOKEN=\$(op read op://private/CLOUDFLARE_API_TOKEN_ISAAC/credential --no-newline)"

alias GITHUB_PERSONAL_ACCESS_TOKEN_HOLIBOB_CLAUDE="export GITHUB_PERSONAL_ACCESS_TOKEN=\$(op read op://private/GITHUB_PERSONAL_ACCESS_TOKEN_HOLIBOB_CLAUDE/credential --no-newline)"

export PATH="$HOME/.cargo/bin:$PATH"
export PATH="/usr/local/bin:$PATH"
export PATH="$HOME/.local/share/bob/nvim-bin:$PATH"
eval "$(/opt/homebrew/bin/brew shellenv)"
[ -f ~/.fzf.zsh ] && source ~/.fzf.zsh

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

. "$HOME/.local/bin/env"

# bun completions
[ -s "/Users/isaac/.bun/_bun" ] && source "/Users/isaac/.bun/_bun"

# bun
export BUN_INSTALL="$HOME/.bun"
export PATH="$BUN_INSTALL/bin:$PATH"
export PATH=~/.npm-global/bin:$PATH

# pnpm
export PNPM_HOME="/Users/isaac/Library/pnpm"
case ":$PATH:" in
  *":$PNPM_HOME:"*) ;;
  *) export PATH="$PNPM_HOME:$PATH" ;;
esac
# pnpm end

# Created by `pipx` on 2025-04-16 20:43:54
export PATH="$PATH:/Users/isaac/Library/Python/3.13/bin"

export PATH=$PATH:/usr/local/go/bin
export PATH=$PATH:$GOPATH/bin
export PATH=$PATH:$(go env GOPATH)/bin

# opencode
export PATH=/Users/isaac/.opencode/bin:$PATH

# opencode
export PATH=/Users/isaac/.opencode/bin:$PATH
export PATH="/usr/local/opt/mysql-client/bin:$PATH"
export PATH="/opt/homebrew/opt/mysql-client/bin:$PATH"

export PATH=~/.npm-global/bin:$PATH


export EDITOR="nvim"




# Added by Antigravity
export PATH="/Users/isaac/.antigravity/antigravity/bin:$PATH"
