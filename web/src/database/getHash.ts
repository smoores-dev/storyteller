import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"

export async function main() {
  const path = process.argv[2]
  if (!path) throw new Error("Missing migration path arg")

  const contents = await readFile(path, {
    encoding: "utf-8",
  })
  const hash = createHash("sha256").update(contents).digest("hex")
  // eslint-disable-next-line no-console
  console.log(hash)
}

if (process.argv[1] === import.meta.filename) {
  void main()
}
