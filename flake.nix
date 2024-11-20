{
  description = "Development environment for Storyteller";

  # Flake inputs
  inputs = {
    nixpkgs.url = "nixpkgs";
    devenv.url = "github:cachix/devenv";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  # Flake outputs
  outputs =
    {
      self,
      nixpkgs,
      devenv,
      ...
    }@inputs:
    let
      # Systems supported
      allSystems = [
        "x86_64-linux" # 64-bit Intel/AMD Linux
        "aarch64-linux" # 64-bit ARM Linux
        "x86_64-darwin" # 64-bit Intel macOS
        "aarch64-darwin" # 64-bit ARM macOS
      ];

      # Helper to provide system-specific attributes
      forAllSystems =
        f:
        nixpkgs.lib.genAttrs allSystems (
          system:
          f {
            pkgs = import nixpkgs { inherit system; };
          }
        );
    in
    {
      packages = nixpkgs.lib.genAttrs allSystems (system: {
        devenv-up = self.devShells.${system}.default.config.procfileScript;
      });

      # Development environment output
      devShells = forAllSystems (
        { pkgs }:
        {
          default = devenv.lib.mkShell {
            inherit inputs pkgs;
            modules = [
              (
                { pkgs, config, ... }:
                {
                  # This is your devenv configuration
                  packages = [
                    pkgs.ffmpeg
                    pkgs.nodejs_22
                    (pkgs.yarn.override { nodejs = pkgs.nodejs_22; })
                    pkgs.sqlite
                  ];

                  # processes.run.exec = "hello";
                }
              )
            ];
            # LD_LIBRARY_PATH = "${libstdcpp}/lib/";
          };
        }
      );
    };
}
