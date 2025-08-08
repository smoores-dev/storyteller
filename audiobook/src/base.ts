import { IPicture, PictureType, type File } from "node-taglib-sharp"

function splitNames(names: string[]): string[] {
  return names.flatMap((entry) =>
    entry.split(/[;,/]/).map((name) => name.trim()),
  )
}

export abstract class BaseAudiobookEntry {
  abstract filename: string
  protected abstract file: File | null

  abstract getData(): Promise<Uint8Array>

  abstract createFile(): Promise<File>

  async getFile(): Promise<File> {
    if (this.file) return this.file

    const file = await this.createFile()
    this.file = file
    return this.file
  }

  async getTitle(): Promise<string | null> {
    const file = await this.getFile()
    return file.tag.title
  }

  async setTitle(title: string): Promise<void> {
    const file = await this.getFile()
    file.tag.title = title
  }

  async getDescription(): Promise<string | null> {
    const file = await this.getFile()
    return file.tag.description
  }

  async setDescription(description: string): Promise<void> {
    const file = await this.getFile()
    file.tag.description = description
  }

  async getAuthors(): Promise<string[]> {
    const file = await this.getFile()

    // This is where the most accurate artist data
    // often lives, but sometimes it's empty
    const albumArtists = file.tag.albumArtists
    if (albumArtists.length) {
      return splitNames(albumArtists)
    }

    // This is the second best option. It's more
    // often populated, but also more likely to
    // have junk data, including narrators or even
    // other metadata
    const artists = file.tag.performers
    return splitNames(artists)
  }

  async setAuthors(authors: string[]): Promise<void> {
    const file = await this.getFile()
    // Other tools may attempt to find authors
    // in both of these places, so we just set
    // both
    file.tag.albumArtists = authors
    file.tag.performers = authors
  }

  async getNarrators(): Promise<string[]> {
    const file = await this.getFile()
    // Sometimes narrators are stored in the
    // composers tag, sometimes in conductor
    const composers = file.tag.composers
    if (composers.length) {
      return splitNames(composers)
    }
    // Some tools treat this tag as the
    // "performer" tag, and store narrators
    // here
    const conductor = file.tag.conductor
    if (!conductor) return []
    return splitNames([conductor])
  }

  async setNarrators(narrators: string[]): Promise<void> {
    const file = await this.getFile()
    file.tag.composers = narrators
    file.tag.conductor = narrators.join(";")
  }

  async getCoverArt(): Promise<IPicture | null> {
    const file = await this.getFile()

    return (
      file.tag.pictures.find(
        (picture) => picture.type === PictureType.FrontCover,
      ) ?? null
    )
  }

  async setCoverArt(picture: IPicture): Promise<void> {
    const file = await this.getFile()
    const pictures = file.tag.pictures
    const frontCover = pictures.find(
      (picture) => picture.type === PictureType.FrontCover,
    )
    if (frontCover) {
      Object.assign(frontCover, picture)
    } else {
      pictures.push(picture)
    }
    file.tag.pictures = pictures
  }

  save(): void {
    this.file?.save()
  }
}

export interface AudiobookChapter {
  filename: string
  start: number
  stop: number
  title: string
}

export interface AudiobookMetadata {
  title?: string
  description?: string
  coverArt?: IPicture
  chapters?: AudiobookChapter[]
  authors?: string[]
  narrators?: string[]
}

export abstract class BaseAudiobook {
  protected metadata: AudiobookMetadata = {}
  protected abstract entries: BaseAudiobookEntry[]

  protected async getFirstValue<T>(
    getter: (entry: BaseAudiobookEntry) => Promise<T>,
  ): Promise<T | null> {
    for (const entry of this.entries) {
      const value = await getter(entry)
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (value) return value
    }

    return null
  }

  protected async setValue(
    setter: (entry: BaseAudiobookEntry) => Promise<void>,
  ): Promise<void> {
    for (const entry of this.entries) {
      await setter(entry)
    }
  }

  async getTitle(): Promise<string | null> {
    if (this.metadata.title) {
      return this.metadata.title
    }

    const title = await this.getFirstValue((entry) => entry.getTitle())
    if (title) this.metadata.title = title
    return title
  }

  async setTitle(title: string): Promise<void> {
    this.metadata.title = title

    await this.setValue((entry) => entry.setTitle(title))
  }

  async getDescription(): Promise<string | null> {
    if (this.metadata.description) {
      return this.metadata.description
    }
    const description = await this.getFirstValue((entry) =>
      entry.getDescription(),
    )
    if (description) this.metadata.description = description
    return description
  }

  async setDescription(description: string): Promise<void> {
    this.metadata.description = description

    await this.setValue((entry) => entry.setDescription(description))
  }

  async getAuthors(): Promise<string[]> {
    if (this.metadata.authors) {
      return this.metadata.authors
    }
    const authors = await this.getFirstValue((entry) => entry.getAuthors())
    if (authors) this.metadata.authors = authors
    return authors ?? []
  }

  async setAuthors(authors: string[]): Promise<void> {
    this.metadata.authors = authors

    await this.setValue((entry) => entry.setAuthors(authors))
  }

  async getNarrators(): Promise<string[]> {
    if (this.metadata.narrators) {
      return this.metadata.narrators
    }
    const narrators = await this.getFirstValue((entry) => entry.getNarrators())
    if (narrators) this.metadata.narrators = narrators
    return narrators ?? []
  }

  async setNarrators(narrators: string[]): Promise<void> {
    this.metadata.narrators = narrators

    await this.setValue((entry) => entry.setNarrators(narrators))
  }

  async getCoverArt(): Promise<IPicture | null> {
    if (this.metadata.coverArt) {
      return this.metadata.coverArt
    }

    const coverArt = await this.getFirstValue((entry) => entry.getCoverArt())
    if (coverArt) this.metadata.coverArt = coverArt
    return coverArt
  }

  async setCoverArt(picture: IPicture): Promise<void> {
    this.metadata.coverArt = picture

    await this.setValue((entry) => entry.setCoverArt(picture))
  }
}
