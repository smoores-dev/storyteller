import { PyObject } from "pymport"

export type FuzzySearch = PyObject<{
  find_near_matches: (
    needle: string,
    haystack: string,
    opts: { max_l_dist?: number },
  ) => Array<{ start: number; end: number }>
}>
