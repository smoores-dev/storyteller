#!/bin/bash
# Exit immediately if a command exits with a non-zero status
set -e

# Run migrations
node migrate-dist/migrate.cjs

# Start the server and replace the shell with the server process
exec node server.js

