import { randomUUID } from "node:crypto"
import { createWriteStream, rmSync } from "node:fs"
import { copyFile, cp, mkdir, readdir, rm, writeFile } from "node:fs/promises"
import {
  basename as autoBasename,
  dirname as autoDirname,
  extname,
  join as autoJoin,
} from "node:path"

import { LocalizedString } from "@readium/shared"
import { ZipFile } from "yazl"

import { Epub } from "@storyteller-platform/epub"
import { isHiddenFile, scratchPath } from "@storyteller-platform/fs"
import { MediaType } from "@storyteller-platform/media-types"

import { EmissionsReader } from "../../emit/fs.ts"
import {
  generateGuidedNavigationDocuments,
  generateGuidedNavigationManifest,
} from "../../readium/guidedNavigation.ts"
import { rangeBehaviour } from "../holes.ts"

import { type AlignOptions, Aligner } from "./Aligner.ts"
import { NO_DECISIONS } from "./exclusions.ts"

export async function ctcAlign(
  input: string,
  output: string,
  emissionsDir: string,
  audiobookDir: string,
  options: AlignOptions,
) {
  const outFormat = options.outFormat ?? "epub"
  const epubPath =
    outFormat === "epub"
      ? scratchPath(
          `storyteller-platform-align-${randomUUID()}`,
          autoBasename(output),
        )
      : input

  using stack = new DisposableStack()
  stack.defer(() => {
    if (outFormat === "epub") {
      try {
        rmSync(autoDirname(epubPath), { recursive: true, force: true })
      } catch {
        // This is a best effort cleanup of a tmp file, it's fine
        // if it fails
      }
    }
  })

  if (outFormat === "epub") {
    await mkdir(autoDirname(epubPath), { recursive: true })
    await copyFile(input, epubPath)
  }

  const audiobookFiles = await readdir(audiobookDir).then((filenames) =>
    filenames
      .filter(
        (f) => !isHiddenFile(f) && MediaType.fromPath(f)?.kind === "audio",
      )
      .toSorted((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .map((f) => autoJoin(audiobookDir, f)),
  )

  using epub = await Epub.from(epubPath)

  const emissions = await EmissionsReader.from(emissionsDir)
  if (emissions.tokenizer !== null) {
    throw new Error(
      "These emissions come from a model with a subword vocabulary, which the aligner does not support yet. Use the quartznet15x5 or mms model.",
    )
  }

  const aligner = new Aligner(
    epub,
    audiobookFiles,
    emissions,
    options.granularity,
    options.textRef,
    options.primaryLocale,
    options.logger,
    options.signal,
    rangeBehaviour(options),
    {
      decisions: options.decisions ?? NO_DECISIONS,
      autoExclude: options.autoExclude ?? true,
    },
  )

  const timing = await aligner.alignBook(options.onProgress)

  if (outFormat === "epub") {
    await epub.saveAndClose()
    await mkdir(autoDirname(output), { recursive: true })
    await copyFile(epubPath, output)
  } else {
    const guidedNavigationDocuments =
      await generateGuidedNavigationDocuments(epub)

    const manifest = generateGuidedNavigationManifest(
      new LocalizedString(
        (await epub.getTitle()) ?? autoBasename(input, extname(input)),
      ),
      guidedNavigationDocuments,
    )

    const tmpArchivePath = scratchPath(
      `storyteller-platform-epub-${randomUUID()}`,
    )

    // eslint-disable-next-line @typescript-eslint/no-invalid-void-type
    const { promise, resolve } = Promise.withResolvers<void>()
    const zipfile = new ZipFile()

    const writeStream = createWriteStream(tmpArchivePath)

    writeStream.on("close", () => {
      resolve()
    })

    await using stack = new AsyncDisposableStack()
    stack.defer(async () => {
      writeStream.close()
      await rm(tmpArchivePath, { force: true })
    })

    zipfile.outputStream.pipe(writeStream)

    zipfile.addBuffer(
      Buffer.from(JSON.stringify(manifest.serialize())),
      "manifest.json",
    )

    for (const doc of guidedNavigationDocuments) {
      const selfLink = doc.links?.findWithRel("self")
      if (!selfLink) continue
      zipfile.addBuffer(
        Buffer.from(JSON.stringify(doc.serialize())),
        selfLink.href,
      )
    }

    zipfile.end()
    await promise

    await cp(tmpArchivePath, output)

    epub.discardAndClose()
  }

  if (options.reportsPath) {
    await mkdir(autoDirname(options.reportsPath), { recursive: true })

    await writeFile(
      options.reportsPath,
      JSON.stringify(aligner.report, null, 2),
      {
        encoding: "utf-8",
      },
    )
  }

  return timing
}
