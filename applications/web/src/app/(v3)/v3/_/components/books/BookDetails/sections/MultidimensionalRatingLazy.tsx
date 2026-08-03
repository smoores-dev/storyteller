"use client"

import dynamic from "next/dynamic"

// recharts is heavy and only needed once the rating radar is on screen, so
// the chart loads in its own chunk instead of every page's bundle
export const MultidimensionalRating = dynamic(
  () =>
    import("./MultidimensionalRating").then(
      (mod) => mod.MultidimensionalRating,
    ),
  { ssr: false },
)
