import { writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

import { serializeTableJson } from "./json.ts"

const target = fileURLToPath(new URL("./table.json", import.meta.url))

writeFileSync(target, serializeTableJson(), "utf8")
