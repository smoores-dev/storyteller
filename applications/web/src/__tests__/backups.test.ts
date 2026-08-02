import assert from "node:assert"
import {
  existsSync,
  mkdirSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from "node:fs"
import { join } from "node:path"
import { beforeEach, describe, it } from "node:test"

import { listBackups, pruneAutoBackups, resolveBackupPath } from "@/backups"
import { BACKUP_DIR } from "@/directories"

function seedBackupFile(name: string, ageSeconds: number) {
  const path = join(BACKUP_DIR, name)
  writeFileSync(path, "not a real database")
  const stamp = new Date(Date.now() - ageSeconds * 1000)
  utimesSync(path, stamp, stamp)
  return path
}

void describe("backups", () => {
  beforeEach(() => {
    rmSync(BACKUP_DIR, { recursive: true, force: true })
    mkdirSync(BACKUP_DIR, { recursive: true })
  })

  void it("lists backups newest first", async () => {
    seedBackupFile("storyteller-auto-old.db", 300)
    seedBackupFile("storyteller-manual-new.db", 10)
    seedBackupFile("not-a-backup.txt", 0)

    const backups = await listBackups()
    assert.deepStrictEqual(
      backups.map((backup) => backup.name),
      ["storyteller-manual-new.db", "storyteller-auto-old.db"],
    )
  })

  void it("rejects backup names that escape the backups dir", () => {
    assert.strictEqual(resolveBackupPath("../secret.key.db"), null)
    assert.strictEqual(resolveBackupPath("nested/backup.db"), null)
    assert.strictEqual(resolveBackupPath("backup.txt"), null)
    assert.ok(resolveBackupPath("storyteller-manual-x.db"))
  })

  void it("prunes only scheduled backups beyond the retention count", async () => {
    const autoNewest = seedBackupFile("storyteller-auto-1.db", 10)
    const autoMiddle = seedBackupFile("storyteller-auto-2.db", 100)
    const autoOldest = seedBackupFile("storyteller-auto-3.db", 200)
    const manualOld = seedBackupFile("storyteller-manual-old.db", 500)
    const preRestore = seedBackupFile("pre-restore-123.db", 600)

    await pruneAutoBackups(2)

    assert.ok(existsSync(autoNewest))
    assert.ok(existsSync(autoMiddle))
    assert.ok(!existsSync(autoOldest))
    assert.ok(existsSync(manualOld))
    assert.ok(existsSync(preRestore))
  })
})
