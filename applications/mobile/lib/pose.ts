import { useHinge } from "expo-hinge"

/**
 * Whether the device is open far enough for its window to span the fold.
 */
export function useSpansFold() {
  const hinge = useHinge()

  return hinge?.status === "partiallyOpen" || hinge?.status === "fullyOpen"
}
