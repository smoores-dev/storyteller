set -e

# compile against the sqlite headers better-sqlite3 ships (the ones its
# bundled sqlite is built from). system headers are not reliable here: the
# macOS SDK defines SQLITE_OMIT_LOAD_EXTENSION, which disables the extension
# api macros in sqlite3ext.h and leaves unresolvable sqlite3_* symbols
SQLITE_INCLUDE="$(node -p "require('path').join(require('path').dirname(require.resolve('better-sqlite3/package.json')), 'deps', 'sqlite3')")"

if [[ "$(uname)" == "Darwin" ]]; then
  gcc -g -fPIC -rdynamic -shared -I "$SQLITE_INCLUDE" sqlite/uuid.c -o sqlite/uuid.c.dylib
else
  gcc -g -fPIC -rdynamic -shared -I "$SQLITE_INCLUDE" sqlite/uuid.c -o sqlite/uuid.c.so
fi
