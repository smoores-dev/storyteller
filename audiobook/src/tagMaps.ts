import { type InputFormat, MP3, MP4 } from "mediabunny"

export const readTagMap = {
  trackTitle: ["TT2", "TIT2", "©nam"],
  title: ["TAL", "TALB", "TT2", "TIT2", "©alb", "©nam"],
  subtitle: ["TT3", "TIT3", "Subt", "----:com.apple.iTunes:SUBTITLE", "©gen"],
  description: [
    "COM",
    "TDES",
    "COMM",
    "©des",
    "ldes",
    "desc",
    "©cmt",
    "©com",
    "----:com.apple.iTunes:NOTES",
  ],
  authors: [
    // albumArtists
    "TP2",
    "TPE2",
    "aART",
    "----:com.apple.iTunes:Band",
    // artists
    "TP1",
    "TPE1",
    "TXXX:Artists",
    "©ART",
    "----:com.apple.iTunes:ARTISTS",
  ],
  narrators: [
    // Narrator tag, almost never used
    "©nrt",
    // composers
    "TCM",
    "TCOM",
    "©wrt",
    // conductors
    "TP3",
    "TPE3",
    "----:com.apple.iTunes:CONDUCTOR",
    "©con",
    "cond",
  ],
  publisher: ["©pub"],
  releaseDate: ["TDR", "TDRL", "rldt"],
}

const writeIdv3TagMap = {
  title: ["TALB"],
  subtitle: ["TIT3"],
  description: ["TDES", "COMM"],
  authors: ["TPE2", "TPE1", "TXXX:Artists"],
  narrators: ["TCOM", "TPE3"],
  publisher: [],
  releaseDate: ["TDRL"],
}

const writeMp4TagMap = {
  title: ["©alb"],
  subtitle: ["Subt", "----:com.apple.iTunes:SUBTITLE"],
  description: [
    "©des",
    "ldes",
    "desc",
    "©cmt",
    "©com",
    "----:com.apple.iTunes:NOTES",
  ],
  authors: [
    "aART",
    "----:com.apple.iTunes:Band",
    "©ART",
    "----:com.apple.iTunes:ARTISTS",
  ],
  narrators: [
    "©nrt",
    "©wrt",
    "----:com.apple.iTunes:CONDUCTOR",
    "©con",
    "cond",
  ],
  publisher: ["©pub"],
  releaseDate: ["rldt"],
}

export function getWriteTags(
  format: InputFormat,
  tag: keyof typeof writeIdv3TagMap,
) {
  if (format === MP3) {
    return writeIdv3TagMap[tag]
  }
  if (format === MP4) {
    return writeMp4TagMap[tag]
  }
  return []
}
