import { pymport } from "pymport"
import { Module } from "./fuzzysearch"

const fuzzysearch = pymport("fuzzysearch") as Module

export function findNearestMatch(
  needle: string,
  haystack: string,
  options: { max_l_dist?: number },
) {
  const matches = fuzzysearch
    .get("find_near_matches")
    .call(needle, haystack, options)
  const firstMatch = matches.item(0)
  if (!firstMatch) return firstMatch
  return {
    start: firstMatch.get("start").toJS(),
    end: firstMatch.get("end").toJS(),
  }
}
