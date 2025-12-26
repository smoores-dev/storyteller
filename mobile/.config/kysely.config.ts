import { db } from "../database/db.ts"
import { defineConfig } from "kysely-ctl"

export default defineConfig({
  kysely: db,
})
