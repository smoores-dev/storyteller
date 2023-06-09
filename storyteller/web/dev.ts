#!/usr/bin/env -S deno run -A --watch=static/,routes/

import dev from "$fresh/dev.ts";

const baseUrl = new URL(".", import.meta.url);

await dev(baseUrl.toString(), "./main.ts");
