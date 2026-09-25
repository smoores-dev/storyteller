import { MediaSpatialDimension } from "./mediaSpatial.ts"
import { MediaTemporalDimension } from "./mediaTemporal.ts"

export class MediaDimensions {
  temporal?: MediaTemporalDimension
  spatial?: MediaSpatialDimension
  tracks: string[] = []
  id?: string
  unknown: string[] = []

  constructor(entries: [string, string][] = []) {
    for (const [key, value] of entries) {
      switch (key) {
        case "t": {
          this.temporal = new MediaTemporalDimension(decodeURIComponent(value))
          if (this.id) {
            this.id = undefined
          }
          break
        }
        case "id": {
          this.id = decodeURIComponent(value)
          if (this.temporal) {
            this.temporal = undefined
          }
          break
        }
        case "xywh": {
          this.spatial = new MediaSpatialDimension(decodeURIComponent(value))
          break
        }
        case "track": {
          this.tracks.push(decodeURIComponent(value))
          break
        }
        default: {
          this.unknown.push(key ? `${key}=${value}` : value)
        }
      }
    }
  }

  toString() {
    const temporal = this.temporal && `t=${this.temporal.toString()}`
    const spatial = this.spatial && `xywh=${this.spatial.toString()}`
    const tracks = this.tracks.map(
      (track) => `track=${encodeURIComponent(track)}`,
    )
    const id = this.id === undefined ? "" : `id=${encodeURIComponent(this.id)}`
    return [temporal, spatial, ...tracks, id, ...this.unknown]
      .filter((e) => !!e)
      .join("&")
  }
}
