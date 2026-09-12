import assert from "node:assert"
import { describe, it } from "node:test"

import { type DisplayJob } from "@/database/jobs"
import {
  applyJobEvent,
  applyJobPatch,
  compareJobs,
  jobMatchesFilter,
  queueJobNext,
} from "@/jobList"
import { type UUID } from "@/uuid"

function job(
  overrides: Omit<Partial<DisplayJob>, "uuid"> & { uuid: string },
): DisplayJob {
  return {
    type: "book_align",
    bookUuid: `book-${overrides.uuid}` as UUID,
    bookTitle: `Title ${overrides.uuid}`,
    status: "QUEUED",
    stage: null,
    progress: 0,
    position: 0,
    restart: null,
    error: null,
    startedAt: null,
    finishedAt: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    config: null,
    stats: null,
    alignmentGrade: null,
    alignmentReportUuid: null,
    alignmentSentenceCoverage: null,
    alignmentAudioCoverage: null,
    ...overrides,
    uuid: overrides.uuid as UUID,
  }
}

const uuids = (list: DisplayJob[]) => list.map((j) => j.uuid)

void describe("jobMatchesFilter", () => {
  void it("derives statuses from the list type", () => {
    assert.equal(
      jobMatchesFilter(job({ uuid: "a", status: "RUNNING" }), {
        type: "active",
      }),
      true,
    )
    assert.equal(
      jobMatchesFilter(job({ uuid: "a", status: "DONE" }), {
        type: "active",
      }),
      false,
    )
    assert.equal(
      jobMatchesFilter(job({ uuid: "a", status: "DONE" }), {
        type: "finished",
      }),
      true,
    )
  })

  void it("lets explicit statuses override the type", () => {
    assert.equal(
      jobMatchesFilter(job({ uuid: "a", status: "DONE" }), {
        type: "finished",
        statuses: ["ERROR"],
      }),
      false,
    )
  })

  void it("matches search on the title, case-insensitively", () => {
    const j = job({ uuid: "a", bookTitle: "The Brothers Karamazov" })
    assert.equal(jobMatchesFilter(j, { search: "brothers" }), true)
    assert.equal(jobMatchesFilter(j, { search: "sisters" }), false)
    assert.equal(
      jobMatchesFilter(job({ uuid: "b", bookTitle: null }), { search: "x" }),
      false,
    )
  })

  void it("filters by book", () => {
    const j = job({ uuid: "a" })
    assert.equal(jobMatchesFilter(j, { bookUuid: j.bookUuid as UUID }), true)
    assert.equal(jobMatchesFilter(j, { bookUuid: "other" as UUID }), false)
  })
})

void describe("compareJobs", () => {
  void it("defaults to queue order with a stable tiebreak", () => {
    const list = [
      job({ uuid: "c", position: 2 }),
      job({ uuid: "b", position: 1, createdAt: "2026-01-02T00:00:00Z" }),
      job({ uuid: "a", position: 1 }),
    ]
    list.sort(compareJobs(undefined))
    assert.deepEqual(uuids(list), ["a", "b", "c"])
  })

  void it("sorts nulls first ascending and last descending, like sqlite", () => {
    const list = [
      job({ uuid: "a", finishedAt: "2026-01-03T00:00:00Z" }),
      job({ uuid: "b", finishedAt: null }),
      job({ uuid: "c", finishedAt: "2026-01-02T00:00:00Z" }),
    ]
    list.sort(compareJobs({ sort: "finishedAt", order: "asc" }))
    assert.deepEqual(uuids(list), ["b", "c", "a"])
    list.sort(compareJobs({ sort: "finishedAt", order: "desc" }))
    assert.deepEqual(uuids(list), ["a", "c", "b"])
  })
})

void describe("applyJobEvent", () => {
  const active = { type: "active" as const }

  void it("inserts a created job in queue order", () => {
    const list = [
      job({ uuid: "a", position: 0 }),
      job({ uuid: "c", position: 2 }),
    ]
    const result = applyJobEvent(list, active, {
      type: "jobCreated",
      jobUuid: "b" as UUID,
      payload: job({ uuid: "b", position: 1 }),
    })
    assert.equal(result, "patched")
    assert.deepEqual(uuids(list), ["a", "b", "c"])
  })

  void it("drops a job that leaves the active set", () => {
    const list = [job({ uuid: "a", status: "RUNNING" }), job({ uuid: "b" })]
    applyJobEvent(list, active, {
      type: "jobUpdated",
      jobUuid: "a" as UUID,
      payload: job({ uuid: "a", status: "DONE" }),
    })
    assert.deepEqual(uuids(list), ["b"])
  })

  void it("re-sorts after a position change", () => {
    const list = [
      job({ uuid: "a", position: 0, status: "RUNNING" }),
      job({ uuid: "b", position: 1 }),
      job({ uuid: "c", position: 2 }),
    ]
    applyJobEvent(list, active, {
      type: "jobUpdated",
      jobUuid: "c" as UUID,
      payload: job({ uuid: "c", position: 0 }),
    })
    applyJobEvent(list, active, {
      type: "jobUpdated",
      jobUuid: "a" as UUID,
      payload: job({ uuid: "a", position: 1, status: "RUNNING" }),
    })
    assert.deepEqual(uuids(list), ["c", "a", "b"])
  })

  void it("keeps a limited list at its limit, newest finished first", () => {
    const finished = {
      type: "finished" as const,
      sort: "finishedAt" as const,
      order: "desc" as const,
      limit: 2,
    }
    const list = [
      job({ uuid: "a", status: "DONE", finishedAt: "2026-01-02T00:00:00Z" }),
      job({ uuid: "b", status: "DONE", finishedAt: "2026-01-01T00:00:00Z" }),
    ]
    const result = applyJobEvent(list, finished, {
      type: "jobUpdated",
      jobUuid: "c" as UUID,
      payload: job({
        uuid: "c",
        status: "DONE",
        finishedAt: "2026-01-03T00:00:00Z",
      }),
    })
    assert.equal(result, "patched")
    assert.deepEqual(uuids(list), ["c", "a"])
  })

  void it("asks for a refetch when a paged list cannot be patched locally", () => {
    const paged = { type: "finished" as const, limit: 2, offset: 2 }
    const list = [
      job({ uuid: "a", status: "DONE" }),
      job({ uuid: "b", status: "DONE" }),
    ]
    assert.equal(
      applyJobEvent(list, paged, {
        type: "jobUpdated",
        jobUuid: "c" as UUID,
        payload: job({ uuid: "c", status: "DONE" }),
      }),
      "refetch",
    )
    assert.equal(
      applyJobEvent(list, paged, {
        type: "jobDeleted",
        jobUuid: "a" as UUID,
        payload: undefined,
      }),
      "refetch",
    )
  })

  void it("ignores jobs that never belonged", () => {
    const list = [job({ uuid: "a" })]
    applyJobEvent(list, active, {
      type: "jobUpdated",
      jobUuid: "z" as UUID,
      payload: job({ uuid: "z", status: "DONE" }),
    })
    applyJobEvent(list, active, {
      type: "jobDeleted",
      jobUuid: "z" as UUID,
      payload: undefined,
    })
    assert.deepEqual(uuids(list), ["a"])
  })
})

void describe("applyJobPatch", () => {
  void it("merges into the cached job and applies list rules", () => {
    const list = [job({ uuid: "a", status: "RUNNING" }), job({ uuid: "b" })]
    applyJobPatch(list, { type: "active" }, "a" as UUID, {
      status: "CANCELED",
    })
    assert.deepEqual(uuids(list), ["b"])
  })

  void it("does nothing for jobs it cannot see", () => {
    const list = [job({ uuid: "a" })]
    applyJobPatch(list, { type: "active" }, "zzz" as UUID, { status: "PAUSED" })
    assert.deepEqual(uuids(list), ["a"])
  })
})

void describe("queueJobNext", () => {
  void it("places the job right behind running jobs and renumbers", () => {
    const list = [
      job({ uuid: "a", position: 0, status: "RUNNING" }),
      job({ uuid: "b", position: 1, status: "QUEUED" }),
      job({ uuid: "c", position: 2, status: "PAUSED" }),
      job({ uuid: "d", position: 3, status: "DONE" }),
    ]
    assert.deepEqual(queueJobNext(list, "c" as UUID), ["a", "c", "b"])
    assert.deepEqual(
      list.map((item) => [item.uuid, item.position]),
      [
        ["a", 0],
        ["b", 2],
        ["c", 1],
        ["d", 3],
      ],
    )
  })
})
