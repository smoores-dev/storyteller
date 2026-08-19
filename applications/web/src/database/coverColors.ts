export type StoredCoverColor = {
  r: number
  g: number
  b: number
  // mask-weighted fraction of pixels covered by this color, 0-1
  fraction?: number
  // oklab chroma normalized to 0-1
  chroma?: number
}
