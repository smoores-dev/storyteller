import { join } from "node:path"

import { emit } from "../src/emit/emit.ts"

const [fixture, language] = process.argv.slice(2)
if (!fixture || !language) {
  console.error(
    "usage: npx tsx scripts/prepare-fixture.ts <fixture-dir> <language>",
  )
  process.exit(1)
}

const timing = await emit(join(fixture, "audio"), join(fixture, "emissions"), {
  model: "quartznet15x5",
  device: "cpu",
  language: new Intl.Locale(language),
  onProgress: (progress) => {
    process.stdout.write(`\r${Math.round(progress * 100)}%`)
  },
})
process.stdout.write("\n")
timing.print()
