import { promisify } from "node:util"
import { exec as execCallback } from "node:child_process"

const exec = promisify(execCallback)

export async function findNearestMatch(
  needle: string,
  haystack: string,
  options: { max_l_dist?: number },
) {
  const { stdout } = await exec(
    `python3 find_nearest_match.py "${needle.replaceAll(/"/g, '\\"')}" "${haystack.replaceAll(/"/g, '\\"')}" ${options.max_l_dist}`,
  )
  return JSON.parse(stdout) as { start: number; end: number } | null
}
