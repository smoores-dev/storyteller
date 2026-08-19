"use client"

import dynamic from "next/dynamic"

export const MultidimensionalRating = dynamic(
  () =>
    import("./MultidimensionalRating").then(
      (mod) => mod.MultidimensionalRating,
    ),
  { ssr: false },
)
