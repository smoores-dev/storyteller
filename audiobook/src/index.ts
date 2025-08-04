import { Uint8ArrayReader, ZipReader } from "@zip.js/zip.js"
import { extname } from "@smoores/path"
import { AudiobookEntry, Uint8ArrayEntry } from "./entry.js"
import { AudiobookMetadata, BaseAudiobook } from "./base.js"

export class Audiobook extends BaseAudiobook {
  protected constructor(
    protected entries: AudiobookEntry[],
    // private onClose?: () => Promise<void> | void,
  ) {
    super()
  }

  static async from(pathOrPathsOrData: Uint8ArrayEntry | Uint8ArrayEntry[]) {
    if (!Array.isArray(pathOrPathsOrData)) {
      const ext = extname(pathOrPathsOrData.filename)
      if (ext === ".zip") {
        const dataReader = new Uint8ArrayReader(pathOrPathsOrData.data)
        const zipReader = new ZipReader(dataReader)
        const zipEntries = await zipReader.getEntries()
        const entries = zipEntries.map((entry) => new AudiobookEntry(entry))
        return new Audiobook(entries)
      }
      return new Audiobook([new AudiobookEntry(pathOrPathsOrData)])
    }

    return new Audiobook(
      pathOrPathsOrData.map((path) => new AudiobookEntry(path)),
    )
  }

  static create(metadata: AudiobookMetadata) {
    const audiobook = new Audiobook([])
    audiobook.metadata = metadata
    return audiobook
  }

  async save(): Promise<Uint8ArrayEntry[]> {
    for (const entry of this.entries) {
      entry.save()
    }

    return await Promise.all(
      this.entries.map(async (entry) => ({
        filename: entry.filename,
        data: await entry.getData(),
      })),
    )
  }
}
