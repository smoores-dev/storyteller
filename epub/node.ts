import { dirname } from "node:path"
import { Epub as BaseEpub } from "./index.js"
import { mkdir, writeFile } from "node:fs/promises"
import { streamFile } from "@smoores/fs"

export type {
  ElementName,
  XmlNode,
  MetadataEntry,
  EpubMetadata,
  DcSubject,
  AlternateScript,
  DcCreator,
  DublinCore,
  Collection,
  ParsedXml,
  XmlElement,
  XmlTextNode,
  ManifestItem,
} from "./index.js"

export class Epub extends BaseEpub {
  static override create(
    ...args: Parameters<typeof BaseEpub.create>
  ): Promise<Epub> {
    return super.create(...args) as Promise<Epub>
  }

  static override async from(
    ...args: Parameters<typeof BaseEpub.from>
  ): Promise<Epub> {
    const pathOrData = args[0]
    const fileData =
      typeof pathOrData === "string" ? await streamFile(pathOrData) : pathOrData
    return super.from(fileData) as Promise<Epub>
  }

  /**
   * Write the current contents of the Epub to a new
   * EPUB archive on disk.
   *
   * This _does not_ close the Epub. It can continue to
   * be modified after it has been written to disk. Use
   * `epub.close()` to close the Epub.
   *
   * When this method is called, the "dcterms:modified"
   * meta tag is automatically updated to the current UTC
   * timestamp.
   *
   * @param path The file path to write the new archive to. The
   *  parent directory does not need te exist -- the path will be
   *  recursively created.
   */
  public async writeToFile(path: string) {
    const data = await this.writeToArray()
    if (!data.length)
      throw new Error(
        "Failed to write zip archive to file; writer returned no data",
      )

    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, data)
  }
}
