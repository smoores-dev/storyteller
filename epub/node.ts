import { mkdir, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

import { npath } from "@yarnpkg/fslib"
import { ZipFS } from "@yarnpkg/libzip"

import { streamFile } from "@storyteller-platform/fs"

import {
  type DublinCore,
  Epub as BaseEpub,
  type EpubMetadata,
} from "./index.ts"

export type {
  AlternateScript,
  Collection,
  DcCreator,
  DcSubject,
  DublinCore,
  ElementName,
  EpubMetadata,
  ManifestItem,
  MetadataEntry,
  ParsedXml,
  XmlElement,
  XmlNode,
  XmlTextNode,
} from "./index.ts"

export class Epub extends BaseEpub {
  static override create(
    dc: DublinCore,
    additionalMetadata: EpubMetadata = [],
  ): Promise<Epub> {
    return super.create(dc, additionalMetadata) as Promise<Epub>
  }

  static override async from(
    ...args: Parameters<typeof BaseEpub.from>
  ): Promise<Epub> {
    const pathOrData = args[0]
    if (typeof pathOrData === "string") {
      return new Epub(
        new ZipFS(npath.toPortablePath(npath.resolve(pathOrData))),
      )
    }
    const fileData =
      typeof pathOrData === "string" ? await streamFile(pathOrData) : pathOrData
    return super.from(fileData) as Promise<Epub>
  }

  /**
   * Write the current contents of the Epub to a new
   * EPUB archive on disk.
   *
   * When this method is called, the "dcterms:modified"
   * meta tag is automatically updated to the current UTC
   * timestamp.
   *
   * @param path The file path to write the new archive to. The
   *  parent directory does not need te exist -- the path will be
   *  recursively created.
   */
  public async saveAndClose(path: string) {
    await mkdir(dirname(path), { recursive: true })
    const data = await this.getArrayAndClose()
    await writeFile(path, data)
  }
}
