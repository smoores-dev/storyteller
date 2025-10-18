export interface AudiobookChapter {
  filename: string
  start: number | null
  title: string | null
}

export interface AudiobookResource {
  filename: string
  type: string
  bitrate: number | null
  duration: number
  title: string | null
}
