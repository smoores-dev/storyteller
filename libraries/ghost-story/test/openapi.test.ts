import assert from "node:assert"

import { expect, it } from "vitest"

import {
  createServer,
  diskFileStore,
  emissionService,
  memoryJobs,
  transcriptionService,
} from "../src/server/index.ts"

it("serves its openapi document without the api key", async () => {
  await using jobs = memoryJobs()
  await using files = await diskFileStore()
  const app = createServer({
    services: [
      emissionService({ jobs, files, device: "cpu" }),
      transcriptionService({ model: "large-v3-turbo" }),
    ],
    files,
    apiKey: "secret",
  })
  const response = await app.request("/openapi.json")
  assert.strictEqual(response.status, 200)
  await expect(
    `${JSON.stringify(await response.json(), null, 2)}\n`,
  ).toMatchFileSnapshot("../openapi.json")
})
