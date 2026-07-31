// storage shape for extracted cover colors, ordered by okmain's ranking
// (most prominent first). rows extracted before okmain gained colorsDetailed
// are plain rgb; fraction/chroma appear on newer extractions and enable
// background/foreground classification down the line.
export type StoredCoverColor = {
  r: number
  g: number
  b: number
  // mask-weighted fraction of pixels covered by this color, 0-1
  fraction?: number
  // oklab chroma normalized to 0-1
  chroma?: number
}
