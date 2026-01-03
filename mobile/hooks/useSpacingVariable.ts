import { useCSSVariable } from "uniwind"

export function useSpacingVariable(multiplier: number) {
  return (useCSSVariable("--spacing") as number) * multiplier
}
