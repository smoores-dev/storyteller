import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cwd } from "node:process"

import Db, { type Database } from "better-sqlite3"
import {
  CamelCasePlugin,
  Kysely,
  ParseJSONResultsPlugin,
  SqliteDialect,
} from "kysely"

import { getSafeFilepathSegment } from "@/assets/paths"
import { replaceDatabase } from "@/database/connection"
import { BooleanPlugin } from "@/database/plugins/booleanPlugin"
import { DatePlugin } from "@/database/plugins/datePlugin"
import type { DB } from "@/database/schema"
import type { Settings } from "@/database/settingsTypes"

const SCHEMA_PATH = join(cwd(), "..", "schema.sql")

const BOOLEAN_FIELDS = [
  "bookCreate",
  "bookDelete",
  "bookDownload",
  "bookList",
  "bookProcess",
  "bookRead",
  "bookUpdate",
  "collectionCreate",
  "featured",
  "inviteDelete",
  "inviteList",
  "isDefault",
  "missing",
  "public",
  "settingsUpdate",
  "userCreate",
  "userDelete",
  "userList",
  "userRead",
  "userUpdate",
  "restartPending",
] as const

const DEFAULT_SETTINGS: Settings = {
  smtpHost: "",
  smtpPort: 25,
  smtpUsername: "",
  smtpPassword: "",
  smtpFrom: "",
  libraryName: "",
  webUrl: "",
  smtpSsl: true,
  smtpRejectUnauthorized: true,
  codec: null,
  bitrate: null,
  maxTrackLength: null,
  transcriptionEngine: null,
  whisperModel: null,
  whisperThreads: 4,
  autoDetectLanguage: false,
  whisperCpuFallback: null,
  whisperServerUrl: null,
  whisperServerApiKey: null,
  googleCloudApiKey: null,
  azureSubscriptionKey: null,
  azureServiceRegion: null,
  amazonTranscribeRegion: null,
  amazonTranscribeAccessKeyId: null,
  amazonTranscribeSecretAccessKey: null,
  amazonTranscribeBucketName: null,
  openAiApiKey: null,
  openAiOrganization: null,
  openAiBaseUrl: null,
  openAiModelName: null,
  deepgramApiKey: null,
  deepgramModel: null,
  parallelTranscodes: 1,
  parallelTranscribes: 1,
  authProviders: [],
  disablePasswordLogin: false,
  readaloudLocationType: "INTERNAL",
  readaloudLocation: "",
  maxUploadChunkSize: null,
  opdsEnabled: null,
  opdsPageSize: null,
  scanCronExpression: null,
  importMode: "reference",
  epub2ImportStrategy: "backup-and-convert",
  epub2BackupSuffix: "_epub2",
  metadataFieldOverrides: {
    cover: "merge",
    title: "merge",
    subtitle: "merge",
    description: "merge",
    language: "merge",
    publicationDate: "merge",
    authors: "merge",
    narrators: "merge",
    creators: "merge",
    series: "merge",
    tags: "merge",
  },
}

function createKyselyInstance(sqlite: Database): Kysely<DB> {
  return new Kysely<DB>({
    dialect: new SqliteDialect({ database: sqlite }),
    plugins: [
      new CamelCasePlugin(),
      new ParseJSONResultsPlugin(),
      new DatePlugin(),
      new BooleanPlugin<DB>({ fields: [...BOOLEAN_FIELDS] }),
    ],
  })
}

function registerUuidFunction(sqlite: Database) {
  sqlite.function("uuid", () => randomUUID())
}

function applySchema(sqlite: Database) {
  const schema = readFileSync(SCHEMA_PATH, "utf-8")
  sqlite.exec(schema)
}

function seedSettings(
  sqlite: Database,
  overrides?: Record<string, string | null>,
) {
  const settings = { ...DEFAULT_SETTINGS, ...overrides }

  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO settings (name, value) VALUES (?, ?)`,
  )

  const insertMany = sqlite.transaction(
    (entries: [string, string | null][]) => {
      for (const [name, value] of entries) {
        insert.run(name, value)
      }
    },
  )

  insertMany(
    Object.entries(settings).map(([name, value]) => [
      name,
      JSON.stringify(value),
    ]),
  )
}

function seedStatuses(sqlite: Database) {
  const insert = sqlite.prepare(
    `INSERT OR IGNORE INTO status (name, is_default) VALUES (?, ?)`,
  )

  insert.run("To read", "1")
  insert.run("Reading", "0")
  insert.run("Read", "0")
}

export type TestDbContext = {
  db: Kysely<DB>
  sqlite: Database
  [Symbol.dispose]: () => void
}

export function setupTestDb(
  settingsOverrides?: Record<string, string | null>,
): TestDbContext {
  const sqlite = new Db(":memory:")

  registerUuidFunction(sqlite)
  sqlite.pragma("journal_mode = WAL")
  sqlite.pragma("foreign_keys = ON")

  applySchema(sqlite)
  seedSettings(sqlite, settingsOverrides)
  seedStatuses(sqlite)

  const testDb = createKyselyInstance(sqlite)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call
  replaceDatabase(testDb)

  return {
    db: testDb,
    sqlite,
    [Symbol.dispose]() {
      sqlite.close()
    },
  }
}

export function seedBooks(
  ctx: TestDbContext,
  books: {
    title: string
    ebook?: string
    audiobook?: string
    readaloud?: string
  }[],
) {
  const insertBook = ctx.sqlite.prepare(
    `INSERT INTO book (title, asset_dir) VALUES (?, ?) RETURNING uuid`,
  )

  const insertEbook = ctx.sqlite.prepare(
    `INSERT INTO ebook (book_uuid, filepath) VALUES (?, ?)`,
  )

  const insertAudiobook = ctx.sqlite.prepare(
    `INSERT INTO audiobook (book_uuid, filepath) VALUES (?, ?)`,
  )

  const insertReadaloud = ctx.sqlite.prepare(
    `INSERT INTO readaloud (book_uuid, filepath, status, current_stage) VALUES (?, ?, 'ALIGNED', 'SPLIT_TRACKS')`,
  )

  const run = ctx.sqlite.transaction(
    (
      items: {
        title: string
        ebook?: string
        audiobook?: string
        readaloud?: string
      }[],
    ) => {
      const uuids: string[] = []

      for (const item of items) {
        const assetDir = getSafeFilepathSegment(item.title)
        const row = insertBook.get(item.title, assetDir) as { uuid: string }
        uuids.push(row.uuid)

        if (item.ebook) insertEbook.run(row.uuid, item.ebook)
        if (item.audiobook) insertAudiobook.run(row.uuid, item.audiobook)
        if (item.readaloud) insertReadaloud.run(row.uuid, item.readaloud)
      }

      return uuids
    },
  )

  return run(books)
}
