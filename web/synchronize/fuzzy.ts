import nodecallspython from "node-calls-python"
import { cwd } from "process"

const py = nodecallspython.interpreter

py.addImportPath("/home/node/.local/venv")
py.addImportPath(cwd())

const fuzzysearch = py.importSync("find_nearest_match", false)

export async function findNearestMatch(
  needle: string,
  haystack: string,
  options: { max_l_dist?: number },
) {
  const match = await py.call(
    fuzzysearch,
    "find_nearest_match",
    needle,
    haystack,
    { __kwargs: true, max_l_dist: options.max_l_dist },
  )

  return (match ?? null) as { start: number; end: number } | null
}
