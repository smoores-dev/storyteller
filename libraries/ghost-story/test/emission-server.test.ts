// import assert from "node:assert"
// import { describe, it } from "node:test"

// import {
//   type EmissionWireResult,
//   decodeEmissions,
//   encodeEmissions,
// } from "../src/emission/EmissionWire.ts"
// import { type Wav2Vec2Result } from "../src/emission/Wav2Vec2Emission.ts"
// import { createEmissionServer } from "../src/server/emissionServer.ts"

// const stubEmissions = [
//   [-0.5, -1.25, -2.5],
//   [-0.125, -3.75, -0.0625],
// ]

// const stubResult: Wav2Vec2Result = {
//   emissions: stubEmissions,
//   vocab: new Map([
//     ["<pad>", 0],
//     ["a", 1],
//     ["b", 2],
//   ]),
//   blankIndex: 0,
//   secondsPerChunk: 25,
//   framesPerChunk: 2,
//   secondsPerFrame: 0.02,
// }

// function createTestApp(apiKey: string | null) {
//   let calls = 0

//   const app = createEmissionServer({
//     model: "onnx-community/mms-300m-1130-forced-aligner-ONNX",
//     device: "cpu",
//     dtype: "fp32",
//     host: "127.0.0.1",
//     port: 0,
//     apiKey,
//     emitImpl: async () => {
//       calls += 1
//       return Promise.resolve(stubResult)
//     },
//   })

//   return { app, getCalls: () => calls }
// }

// function emissionRequest(apiKey?: string): Request {
//   const form = new FormData()
//   form.append("file", new Blob([new Uint8Array([1, 2, 3, 4])]), "chapter.wav")

//   return new Request("http://localhost/audio/emissions", {
//     method: "POST",
//     body: form,
//     ...(apiKey && { headers: { Authorization: `Bearer ${apiKey}` } }),
//   })
// }

// void describe("emission-server", () => {
//   void it("round-trips emissions through the wire encoding", () => {
//     const { emissions, frames, dims } = encodeEmissions(stubEmissions)

//     assert.strictEqual(frames, 2)
//     assert.strictEqual(dims, 3)
//     assert.deepStrictEqual(
//       decodeEmissions(emissions, frames, dims),
//       stubEmissions,
//     )
//   })

//   void it("rejects a ragged emission matrix", () => {
//     assert.throws(
//       () => encodeEmissions([[1, 2], [3]]),
//       /Ragged emission matrix/,
//     )
//   })

//   void it("rejects a payload whose length does not match the shape", () => {
//     const { emissions } = encodeEmissions(stubEmissions)
//     assert.throws(() => decodeEmissions(emissions, 2, 4), /expected 32/)
//   })

//   void it("serves the config", async () => {
//     const { app } = createTestApp(null)

//     const response = await app.request("http://localhost/config")

//     assert.strictEqual(response.status, 200)
//     assert.deepStrictEqual(await response.json(), {
//       model: "onnx-community/mms-300m-1130-forced-aligner-ONNX",
//       device: "cpu",
//       dtype: "fp32",
//       secondsPerChunk: 25,
//     })
//   })

//   void it("returns 401 without the api key", async () => {
//     const { app, getCalls } = createTestApp("hunter2")

//     const config = await app.request("http://localhost/config")
//     assert.strictEqual(config.status, 401)

//     const emissions = await app.request(emissionRequest())
//     assert.strictEqual(emissions.status, 401)
//     assert.strictEqual(getCalls(), 0)
//   })

//   void it("returns 401 for a wrong api key of equal length", async () => {
//     const { app } = createTestApp("hunter2")

//     const response = await app.request(emissionRequest("hunter3"))

//     assert.strictEqual(response.status, 401)
//   })

//   void it("returns emissions with the api key", async () => {
//     const { app, getCalls } = createTestApp("hunter2")

//     const response = await app.request(emissionRequest("hunter2"))

//     assert.strictEqual(response.status, 200)
//     assert.strictEqual(getCalls(), 1)

//     const wire = (await response.json()) as EmissionWireResult

//     assert.deepStrictEqual(wire.vocab, { "<pad>": 0, a: 1, b: 2 })
//     assert.strictEqual(wire.blankIndex, 0)
//     assert.strictEqual(wire.secondsPerChunk, 25)
//     assert.strictEqual(wire.framesPerChunk, 2)
//     assert.strictEqual(wire.secondsPerFrame, 0.02)
//     assert.strictEqual(wire.frames, 2)
//     assert.strictEqual(wire.dims, 3)
//     assert.deepStrictEqual(
//       decodeEmissions(wire.emissions, wire.frames, wire.dims),
//       stubEmissions,
//     )
//     assert.ok(wire.timing.metadata["model"] !== undefined)
//   })

//   void it("rejects a request with no file field", async () => {
//     const { app } = createTestApp(null)

//     const response = await app.request(
//       new Request("http://localhost/audio/emissions", {
//         method: "POST",
//         body: new FormData(),
//       }),
//     )

//     assert.strictEqual(response.status, 400)
//   })

//   void it("processes requests one at a time", async () => {
//     let active = 0
//     let maxActive = 0

//     const app = createEmissionServer({
//       model: "onnx-community/mms-300m-1130-forced-aligner-ONNX",
//       device: "cpu",
//       dtype: "fp32",
//       host: "127.0.0.1",
//       port: 0,
//       emitImpl: async () => {
//         active += 1
//         maxActive = Math.max(maxActive, active)
//         await new Promise((resolve) => globalThis.setTimeout(resolve, 10))
//         active -= 1
//         return stubResult
//       },
//     })

//     const responses = await Promise.all([
//       app.request(emissionRequest()),
//       app.request(emissionRequest()),
//       app.request(emissionRequest()),
//     ])

//     for (const response of responses) {
//       assert.strictEqual(response.status, 200)
//     }
//     assert.strictEqual(maxActive, 1)
//   })
// })
