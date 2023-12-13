{
  description = "Development environment for Storyteller";

  # Flake inputs
  inputs = {
    nixpkgs.url = "nixpkgs";
    nixpkgs-unstable.url = "nixpkgs/nixos-unstable"; # need latest poetry (1.5.x)
  };

  # Flake outputs
  outputs = { self, nixpkgs, nixpkgs-unstable }:
    let
      # Systems supported
      allSystems = [
        "x86_64-linux" # 64-bit Intel/AMD Linux
        "aarch64-linux" # 64-bit ARM Linux
        "x86_64-darwin" # 64-bit Intel macOS
        "aarch64-darwin" # 64-bit ARM macOS
      ];

      # Helper to provide system-specific attributes
      forAllSystems = f: nixpkgs.lib.genAttrs allSystems (system: f {
        pkgs = import nixpkgs { inherit system; };
        pkgs-unstable = import nixpkgs-unstable { inherit system; };
      });
    in
    {
      # Development environment output
      devShells = forAllSystems ({ pkgs, pkgs-unstable }: {
        default =
          let
            # Make libstdc++.so.6 available to pytorch
            libstdcpp = pkgs.stdenv.cc.cc.lib;
            # Use Python 3.10
            python = pkgs.python310;
            nodejs = pkgs.nodejs_20;
            yarn = pkgs.yarn.override { inherit nodejs; };
            # Use latest Poetry
            poetry = pkgs-unstable.poetry;
            # sqlite for debugging
            sqlite = pkgs.sqlite;
          in
          pkgs.mkShell {
            # The Nix packages provided in the environment
            packages = [
              # Python plus helper tools
              (python.withPackages (ps: with ps; [
                virtualenv # Virtualenv
                pip # The pip installer
              ]))
              poetry
              # Node
              nodejs
              yarn
              # sqlite
              sqlite
            ];
            LD_LIBRARY_PATH = "${libstdcpp}/lib/";
          };
      });
    };
}
