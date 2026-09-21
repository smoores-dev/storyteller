import { writeFile } from "node:fs/promises"
import { join } from "node:path"

const base = "https://raw.githubusercontent.com/BYVoid/OpenCC/master"
const out = join(import.meta.dirname, "..", "src", "align", "opencc")

async function download(path: string): Promise<string> {
  const response = await fetch(`${base}/${path}`)
  return response.text()
}

const dictionary = await download("data/dictionary/TSCharacters.txt")
const license = await download("LICENSE")

const table: Record<string, string> = {}
for (const line of dictionary.split("\n")) {
  if (!line || line.startsWith("#")) continue
  const [key, values = ""] = line.split("\t")
  const value = values.split(" ")[0]
  if (!key || !value || key === value || key.length !== value.length) continue
  table[key] = value
}

await writeFile(join(out, "TSCharacters.json"), JSON.stringify(table))
await writeFile(join(out, "LICENSE"), license)
