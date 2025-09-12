if [[ "$(uname)" == "Darwin" ]]; then
  # likely necessary as native macOS sqlite3 doesn't include the headers
  if [[ "$(which sqlite3)" == *"/opt/homebrew/opt/sqlite"* ]]; then
    gcc -g -fPIC -rdynamic -I /opt/homebrew/opt/sqlite/include -shared sqlite/uuid.c -o sqlite/uuid.c.dylib
  else
    gcc -g -fPIC -rdynamic -shared sqlite/uuid.c -o sqlite/uuid.c.dylib
  fi
else
  gcc -g -fPIC -rdynamic -shared sqlite/uuid.c -o sqlite/uuid.c.so
fi