import { UUID } from "@/uuid"
import { join } from "node:path"
import Piscina from "piscina"
import { cwd } from "node:process"

const filename = join(cwd(), "work-dist", "worker.js")

const piscina = new Piscina({
  filename,
  maxThreads: 1,
})

export async function startProcessing(bookUuid: UUID, restart = false) {
  const r = await piscina.run({ bookUuid, restart })
  console.error(r)
}
