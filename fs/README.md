# `@storyteller-platform/fs`

Node.js filesystem utilities for Storyteller.

## `streamFile`

Like `readFile` from `node:fs/promises`, but streams the file into memory in
chunks to avoid libuv's hard-coded 2GB limit on I/O operations.

More info on `readFile` limitations here:
https://github.com/libuv/libuv/pull/1501
