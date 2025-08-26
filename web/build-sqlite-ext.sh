if [[ "$(uname)" == "Darwin" ]]; then
  gcc -g -fPIC -rdynamic -shared sqlite/uuid.c -o sqlite/uuid.c.dylib
else
  gcc -g -fPIC -rdynamic -shared sqlite/uuid.c -o sqlite/uuid.c.so
fi