import { ProcessingTask } from "@/database/processingTasks"
import { describe, it } from "node:test"
import { determineRemainingTasks } from "../worker"
import { randomUUID } from "node:crypto"
import assert from "node:assert"
import {
  ProcessingTaskStatus,
  ProcessingTaskType,
} from "@/apiModels/models/ProcessingStatus"

void describe("determineRemainingTasks", () => {
  void it("produces all tasks when none exist", () => {
    const input: ProcessingTask[] = []

    const uuid = randomUUID()
    const output = determineRemainingTasks(uuid, input)

    assert.deepStrictEqual(output, [
      {
        type: ProcessingTaskType.SPLIT_CHAPTERS,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid: uuid,
      },
      {
        type: ProcessingTaskType.TRANSCRIBE_CHAPTERS,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid: uuid,
      },
      {
        type: ProcessingTaskType.SYNC_CHAPTERS,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid: uuid,
      },
    ])
  })

  void it("only produces non-completed tasks when some are completed", () => {
    const uuid = randomUUID()

    const input: ProcessingTask[] = [
      {
        uuid: randomUUID(),
        type: ProcessingTaskType.SPLIT_CHAPTERS,
        status: ProcessingTaskStatus.COMPLETED,
        progress: 0,
        bookUuid: uuid,
      },
    ]

    const output = determineRemainingTasks(uuid, input)

    assert.deepStrictEqual(output, [
      {
        type: ProcessingTaskType.TRANSCRIBE_CHAPTERS,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid: uuid,
      },
      {
        type: ProcessingTaskType.SYNC_CHAPTERS,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid: uuid,
      },
    ])
  })

  void it("only produces non-completed tasks when some are completed and some are not", () => {
    const uuid = randomUUID()

    const input: ProcessingTask[] = [
      {
        uuid: randomUUID(),
        type: ProcessingTaskType.SPLIT_CHAPTERS,
        status: ProcessingTaskStatus.COMPLETED,
        progress: 0,
        bookUuid: uuid,
      },
      {
        uuid: randomUUID(),
        type: ProcessingTaskType.TRANSCRIBE_CHAPTERS,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid: uuid,
      },
      {
        uuid: randomUUID(),
        type: ProcessingTaskType.SYNC_CHAPTERS,
        status: ProcessingTaskStatus.STARTED,
        progress: 0,
        bookUuid: uuid,
      },
    ]

    const output = determineRemainingTasks(uuid, input)

    assert.deepStrictEqual(output, [input[1], input[2]])
  })

  void it("only produces errored tasks after a failure", () => {
    const uuid = randomUUID()

    const input: ProcessingTask[] = [
      {
        uuid: randomUUID(),
        type: ProcessingTaskType.SPLIT_CHAPTERS,
        status: ProcessingTaskStatus.COMPLETED,
        progress: 0,
        bookUuid: uuid,
      },
      {
        uuid: randomUUID(),
        type: ProcessingTaskType.TRANSCRIBE_CHAPTERS,
        status: ProcessingTaskStatus.COMPLETED,
        progress: 0,
        bookUuid: uuid,
      },
      {
        uuid: randomUUID(),
        type: ProcessingTaskType.SYNC_CHAPTERS,
        status: ProcessingTaskStatus.IN_ERROR,
        progress: 0,
        bookUuid: uuid,
      },
    ]

    const output = determineRemainingTasks(uuid, input)

    assert.deepStrictEqual(output, [input[2]])
  })
})
