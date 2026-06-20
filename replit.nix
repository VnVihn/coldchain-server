{ pkgs }:
{
  deps = [
    pkgs.nodejs_20
    pkgs.python3
    pkgs.gcc
    pkgs.make
  ];
  env = {
    LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath [ pkgs.libuuid ];
  };
}
