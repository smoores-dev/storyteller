import { createWriteStream } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { type Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import { type Entry, open as openZip, type ZipFile as ZipReader } from "yauzl";
import { ZipFile } from "yazl";

import { type AnyReport } from "@/alignmentReportView";
import { scan } from "@/assets/library/scanner/scan";
import { type Candidate } from "@/assets/library/scanner/types";
import {
  getAlignmentReportFilepath,
  getEmissionsFilepath,
  getProcessedAudioFilepath,
  getTranscriptionsFilepath,
} from "@/assets/paths";
import { isAudioFile } from "@/audio";
import { type BookWithRelations, getBook } from "@/database/books";
import { createAlignmentReport } from "@/database/alignmentReports";
import { type UUID } from "@/uuid";

const BUNDLE_MANIFEST = "bundle.json";

async function addFile(
  zipfile: ZipFile,
  filepath: string,
  name: string,
  compress = false,
) {
  try {
    await stat(filepath);
  } catch {
    return;
  }

  zipfile.addFile(filepath, name, { compress });
}

async function addDirectory(
  zipfile: ZipFile,
  dir: string,
  prefix: string,
  {
    compress = false,
    include,
  }: { compress?: boolean; include?: (filename: string) => boolean } = {},
) {
  let filenames: string[];
  try {
    filenames = await readdir(dir);
  } catch {
    return;
  }

  for (const filename of filenames) {
    if (include && !include(filename)) continue;
    zipfile.addFile(join(dir, filename), `${prefix}/${filename}`, { compress });
  }
}

export async function createDebugBundle(book: BookWithRelations) {
  const zipfile = new ZipFile();

  // this needs to be first. if we add an epub first, Archive Util on Macos
  // will think the whole thing is an epub.
  zipfile.addBuffer(
    Buffer.from(
      JSON.stringify({ bookId: book.uuid, title: book.title }, null, 2),
    ),
    BUNDLE_MANIFEST,
  );

  if (book.ebook?.filepath) {
    await addFile(zipfile, book.ebook.filepath, "ebook.epub");
  }

  if (book.readaloud?.filepath) {
    await addFile(zipfile, book.readaloud.filepath, "readaloud.epub");
  }

  if (book.audiobook?.filepath) {
    await addDirectory(zipfile, book.audiobook.filepath, "audiobook", {
      include: isAudioFile,
    });
  }

  await addDirectory(
    zipfile,
    getProcessedAudioFilepath(book),
    "transcoded-audio",
    { include: isAudioFile },
  );
  await addDirectory(zipfile, getEmissionsFilepath(book), "emissions");
  await addDirectory(
    zipfile,
    getTranscriptionsFilepath(book),
    "transcriptions",
    { compress: true },
  );
  await addFile(
    zipfile,
    getAlignmentReportFilepath(book),
    "alignment-report.json",
    true,
  );

  zipfile.end();

  return zipfile.outputStream as Readable;
}

function openZipFile(path: string): Promise<ZipReader> {
  return new Promise((resolvePromise, reject) => {
    openZip(path, { lazyEntries: true, autoClose: false }, (error, zipfile) => {
      if (error) reject(error);
      else resolvePromise(zipfile);
    });
  });
}

function readEntries(zipfile: ZipReader): Promise<Entry[]> {
  return new Promise((resolvePromise, reject) => {
    const entries: Entry[] = [];
    zipfile.on("entry", (entry: Entry) => {
      entries.push(entry);
      zipfile.readEntry();
    });
    zipfile.on("end", () => {
      resolvePromise(entries);
    });
    zipfile.on("error", reject);
    zipfile.readEntry();
  });
}

function openEntryStream(zipfile: ZipReader, entry: Entry): Promise<Readable> {
  return new Promise((resolvePromise, reject) => {
    zipfile.openReadStream(entry, (error, readable) => {
      if (error) reject(error);
      else resolvePromise(readable);
    });
  });
}

export async function isDebugBundle(path: string): Promise<boolean> {
  const zipfile = await openZipFile(path).catch(() => null);
  if (!zipfile) return false;
  try {
    const entries = await readEntries(zipfile);
    return entries.some((entry) => entry.fileName === BUNDLE_MANIFEST);
  } finally {
    zipfile.close();
  }
}

async function extractZip(path: string, directory: string) {
  const root = resolve(directory);
  const zipfile = await openZipFile(path);
  try {
    const entries = await readEntries(zipfile);
    for (const entry of entries) {
      if (entry.fileName.endsWith("/")) continue;
      const target = resolve(root, entry.fileName);
      if (!target.startsWith(root + sep)) continue;
      await mkdir(dirname(target), { recursive: true });
      await pipeline(
        await openEntryStream(zipfile, entry),
        createWriteStream(target),
      );
    }
  } finally {
    zipfile.close();
  }
}

export async function importDebugBundle({
  zipPath,
  bookUuid,
  collectionUuid,
}: {
  zipPath: string;
  bookUuid: UUID;
  collectionUuid?: UUID | undefined;
}) {
  const staging = join(dirname(zipPath), "debug-bundle");
  const has = (name: string) =>
    stat(join(staging, name)).then(
      () => true,
      () => false,
    );

  try {
    await extractZip(zipPath, staging);
    await rm(zipPath, { force: true });

    const manifest = JSON.parse(
      await readFile(join(staging, BUNDLE_MANIFEST), "utf-8"),
    ) as { title?: string };

    const shared = {
      folder: staging,
      bookUuidHint: bookUuid,
      importMode: "move" as const,
      ...(manifest.title && { titleHint: manifest.title }),
      ...(collectionUuid && { collections: [collectionUuid] }),
    };

    const candidates: Candidate[] = [];
    if (await has("ebook.epub")) {
      candidates.push({
        ...shared,
        format: "ebook",
        filepath: join(staging, "ebook.epub"),
        epub2ImportStrategy: "replace",
      });
    }
    if (await has("readaloud.epub")) {
      candidates.push({
        ...shared,
        format: "readaloud",
        filepath: join(staging, "readaloud.epub"),
      });
    }
    if (await has("audiobook")) {
      candidates.push({
        ...shared,
        format: "audiobook",
        filepath: join(staging, "audiobook"),
      });
    }

    await scan({
      source: "upload",
      request: { kind: "candidates", candidates },
      options: { force: true },
      signal: new AbortController().signal,
    });

    const book = await getBook(bookUuid);
    if (!book) {
      throw new Error(`Importing the debug bundle created no book ${bookUuid}`);
    }

    const directories = [
      ["transcoded-audio", getProcessedAudioFilepath(book)],
      ["emissions", getEmissionsFilepath(book)],
      ["transcriptions", getTranscriptionsFilepath(book)],
    ] as const;
    for (const [name, destination] of directories) {
      if (await has(name)) {
        await cp(join(staging, name), destination, { recursive: true });
      }
    }

    if (await has("alignment-report.json")) {
      const reportFilepath = getAlignmentReportFilepath(book);
      await mkdir(dirname(reportFilepath), { recursive: true });
      await cp(join(staging, "alignment-report.json"), reportFilepath);
      await createAlignmentReport({
        jobUuid: null,
        bookUuid,
        report: JSON.parse(
          await readFile(reportFilepath, "utf-8"),
        ) as AnyReport,
      });
    }
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}
