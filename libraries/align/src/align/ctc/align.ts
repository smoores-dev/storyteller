import { randomUUID } from "node:crypto"
import { createWriteStream, rmSync } from "node:fs"
import {
  copyFile,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises"
import {
  basename as autoBasename,
  dirname as autoDirname,
  extname,
  join as autoJoin,
} from "node:path"

import { LocalizedString } from "@readium/shared"
import { ZipFile } from "yazl"

import { isAudioFile } from "@storyteller-platform/audiobook"
import { Epub } from "@storyteller-platform/epub"
import { scratchPath } from "@storyteller-platform/fs"
import { type EmissionResult } from "@storyteller-platform/ghost-story"

import {
  generateGuidedNavigationDocuments,
  generateGuidedNavigationManifest,
} from "../../readium/guidedNavigation.ts"

import { type AlignOptions, Aligner } from "./Aligner.ts"

function sameVocabulary(a: EmissionResult, b: EmissionResult) {
  if (a.blankIndex !== b.blankIndex) return false
  if (a.vocab.size !== b.vocab.size) return false
  for (const [token, index] of a.vocab) {
    if (b.vocab.get(token) !== index) return false
  }
  return true
}

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
      .filter((f) => isAudioFile(f))
      .toSorted()
      .map((f) => autoJoin(audiobookDir, f)),
  )

  using epub = await Epub.from(epubPath)

  const emissionFiles = await readdir(emissionsDir).then(
    (filenames) =>
      filenames
        .filter((f) => f.endsWith(".json"))
        .toSorted()
        .map((f) => autoJoin(emissionsDir, f)),
    () => [] as string[],
  )

  if (emissionFiles.length !== audiobookFiles.length) {
    throw new Error(
      `Found ${emissionFiles.length} emission files in ${emissionsDir} for ${audiobookFiles.length} audio files. Restart processing from the transcription step to regenerate them.`,
    )
  }

  const emissions = await Promise.all(
    emissionFiles.map(async (filepath) => {
      const contents = await readFile(filepath, { encoding: "utf-8" })
      const parsed = JSON.parse(contents) as Omit<EmissionResult, "vocab"> & {
        vocab: Record<string, number>
      }
      return {
        ...parsed,
        vocab: new Map(Object.entries(parsed.vocab)),
      } as EmissionResult
    }),
  )

  const reference = emissions[0]
  if (!reference) {
    throw new Error(
      `Found no emission files in ${emissionsDir}. Restart processing from the transcription step to generate them.`,
    )
  }

  for (let i = 1; i < emissions.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const other = emissions[i]!
    if (!sameVocabulary(reference, other)) {
      throw new Error(
        `${emissionFiles[i]} was produced by a different model than ${emissionFiles[0]}. Restart processing from the transcription step to regenerate them.`,
      )
    }
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
