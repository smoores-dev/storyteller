export interface Emissions {
  values: Float32Array
  frames: number
  classes: number
}

export interface EmissionTokenizer {
  kind: "unigram"
  scores: Float32Array
  unkId: number
}
