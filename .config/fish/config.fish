# Use GPG Agent for SSH (enables SSH via Yubikey)
set -x GPG_TTY (tty)
set -x SSH_AUTH_SOCK (gpgconf --list-dirs agent-ssh-socket)
gpgconf --launch gpg-agent

source $HOME/.config/fish/aliases.fish

if test -e $HOME/.config/fish/env.fish
    source $HOME/.config/fish/env.fish
end

if test -e $HOME/.config/fish/secrets.fish
    source $HOME/.config/fish/secrets.fish
end

