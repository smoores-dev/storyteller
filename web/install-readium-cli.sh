#!/bin/bash

set -e

VERSION=${1:-"0.6.1"}
FORCE_INSTALL=${2:-"false"}

ARCH=$(uname -m)
PLATFORM=$(uname -s | tr '[:upper:]' '[:lower:]')

if [ "$ARCH" = "x86_64" ]; then
    READIUM_ARCH="x86_64"
elif [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    READIUM_ARCH="arm64"
else
    echo "❌ Unsupported architecture: $ARCH"
    exit 1
fi

# version-specific directory to avoid conflicts
INSTALL_BASE_DIR="$HOME/.local/share/readium"
if [ "$(id -u)" = "0" ]; then
    INSTALL_BASE_DIR="/opt/readium"
fi

VERSION_DIR="$INSTALL_BASE_DIR/v$VERSION"
READIUM_PATH="$VERSION_DIR/readium"

# check if this specific version is already installed
# if it is, and we're not forcing an install, exit
# note: `readium -v` is broken, so we are installing files in a specific version directory
# with a symlink to the latest version
if [ -f "$READIUM_PATH" ] && [ "$FORCE_INSTALL" != "true" ]; then
    echo "✅ Readium CLI v$VERSION is already installed at $READIUM_PATH"
    
    # ensure symlink exists
    SYMLINK_DIR="$HOME/.local/bin"
    if [ "$(id -u)" = "0" ]; then
        SYMLINK_DIR="/usr/local/bin"
    fi
    SYMLINK_PATH="$SYMLINK_DIR/readium"
    
    if [ ! -L "$SYMLINK_PATH" ] || [ "$(readlink "$SYMLINK_PATH")" != "$READIUM_PATH" ]; then
        echo "🔗 Creating/updating symlink"
        mkdir -p "$SYMLINK_DIR"
        ln -sf "$READIUM_PATH" "$SYMLINK_PATH"
    fi
    
    exit 0
fi

echo "📦 Installing Readium CLI v$VERSION for $PLATFORM/$READIUM_ARCH"

TEMP_DIR=$(mktemp -d)
trap 'rm -rf "$TEMP_DIR"' EXIT

# download specific version
DOWNLOAD_URL="https://github.com/readium/cli/releases/download/v$VERSION/readium_${PLATFORM}_${READIUM_ARCH}.tar.gz"
echo "⬇️  Downloading from $DOWNLOAD_URL"

if command -v curl &> /dev/null; then
    curl -L -o "$TEMP_DIR/readium.tar.gz" "$DOWNLOAD_URL"
elif command -v wget &> /dev/null; then
    wget -O "$TEMP_DIR/readium.tar.gz" "$DOWNLOAD_URL"
else
    echo "❌ Neither curl nor wget is available"
    exit 1
fi

echo "📦 Extracting archive"
tar -xzf "$TEMP_DIR/readium.tar.gz" -C "$TEMP_DIR"

echo "🔧 Installing to $READIUM_PATH"
mkdir -p "$VERSION_DIR"
cp "$TEMP_DIR/readium" "$READIUM_PATH"
chmod +x "$READIUM_PATH"

# create symlink to make it available in PATH
SYMLINK_DIR="$HOME/.local/bin"
if [ "$(id -u)" = "0" ]; then
    SYMLINK_DIR="/usr/local/bin"
fi
SYMLINK_PATH="$SYMLINK_DIR/readium"

echo "🔗 Creating symlink from $SYMLINK_PATH to $READIUM_PATH"
mkdir -p "$SYMLINK_DIR"
ln -sf "$READIUM_PATH" "$SYMLINK_PATH"

# add symlink directory to PATH if needed (for user installs)
# this is a bit cringe
if [ "$(id -u)" != "0" ] && [[ ":$PATH:" != *":$SYMLINK_DIR:"* ]]; then
    echo "🛣️  Adding $SYMLINK_DIR to PATH"
    
    # add to common shell configs
    for shell_config in ~/.bashrc ~/.zshrc ~/.profile; do
        if [ -f "$shell_config" ]; then
            if ! grep -q "$SYMLINK_DIR" "$shell_config"; then
                echo "export PATH=\"$SYMLINK_DIR:\$PATH\"" >> "$shell_config"
                echo "   Updated $shell_config"
            fi
        fi
    done
    
    # add to fish config if it exists
    if [ -d ~/.config/fish ]; then
        mkdir -p ~/.config/fish
        fish_config=~/.config/fish/config.fish
        if [ ! -f "$fish_config" ] || ! grep -q "$SYMLINK_DIR" "$fish_config"; then
            echo "set -gx PATH $SYMLINK_DIR \$PATH" >> "$fish_config"
            echo "   Updated $fish_config"
        fi
    fi
    
    echo "   Please restart your shell or run: export PATH=\"$SYMLINK_DIR:\$PATH\""
fi

# verify installation
if [ -x "$READIUM_PATH" ] && [ -L "$SYMLINK_PATH" ]; then
    echo "✅ Readium CLI v$VERSION installed successfully!"
    echo "📍 Binary location: $READIUM_PATH"
    echo "🔗 Symlink location: $SYMLINK_PATH"
    
    # offer to clean up old versions
    OLD_VERSIONS=$(find "$INSTALL_BASE_DIR" -maxdepth 1 -type d -name "v*" ! -name "v$VERSION" 2>/dev/null || true)
    if [ -n "$OLD_VERSIONS" ] && [ "$FORCE_INSTALL" != "true" ]; then
        echo ""
        echo "🧹 Found old versions that can be cleaned up:"
        echo "$OLD_VERSIONS" | sed 's/.*v/   v/'
        echo "   To remove them, run: rm -rf $OLD_VERSIONS"
    fi
    
    # show basic info without relying on --version
    echo "🔍 Installation verification:"
    if [ -x "$SYMLINK_PATH" ]; then
        echo "   ✅ Symlink is executable"
        # try to run it briefly to see if it works
        if timeout 2s "$SYMLINK_PATH" --help >/dev/null 2>&1; then
            echo "   ✅ Binary responds to --help"
        else
            echo "   ⚠️  Binary may not be working properly"
        fi
    else
        echo "   ❌ Symlink is not executable"
        exit 1
    fi
else
    echo "❌ Installation failed"
    exit 1
fi