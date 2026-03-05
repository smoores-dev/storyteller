export type AudioCodec = string
export type Bitrate = string

export interface AudioEncoding {
  codec?: AudioCodec | null | undefined
  bitrate?: Bitrate | null | undefined
}
