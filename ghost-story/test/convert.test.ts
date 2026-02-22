/* eslint-disable no-console */
import assert from "node:assert"
import { createReadStream, createWriteStream } from "node:fs"
import { rm, stat } from "node:fs/promises"
import { Server } from "node:http"
import { tmpdir } from "node:os"
import path from "node:path"
import { after, before, describe, it } from "node:test"

import { Converter } from "ffmpeg-stream"

let basicServer: Server | undefined

before(() => {
  console.log("Starting server")
  basicServer = new Server((request, response) => {
    const outputPath = request.url?.split("?output=")[1]
    if (outputPath) {
      const outputStream = createWriteStream(outputPath)
      request.pipe(outputStream)
    }

    request.on("end", () => {
      response.writeHead(200, { "Content-Type": "text/plain" })
      response.end("Gottem")
    })
    request.on("error", (error) => {
      console.error(error)
      response.writeHead(500, { "Content-Type": "text/plain" })
      response.end("Internal Server Error")
    })
  })
  basicServer.listen(4756)
  console.log("Server started")
})

void describe("testing i understand ffmpeg-stream", () => {
  void it("should convert a file to wav", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname

    const converter = new Converter()
    converter.createInputFromFile(inputPath)
    const outputPath = path.join(tmpdir(), `test-${Date.now()}.wav`)
    converter.createOutputToFile(outputPath, {
      f: "wav",
      ar: "16000",
      ac: "1",
    })
    await converter.run()

    const stats = await stat(outputPath)
    assert.ok(stats.isFile())
    assert.ok(stats.size > 0)
    await rm(outputPath)
  })

  void it.only("should be able to stream a file to the server", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname

    const outputPath1 = path.join(tmpdir(), `test-1-${Date.now()}.wav`)
    const outputPath2 = path.join(tmpdir(), `test-2-${Date.now()}.wav`)

    console.time("total conversion 1")
    const converter = new Converter()
    converter.createInputFromFile(inputPath)
    converter.createOutputToFile(outputPath1, { f: "wav" })

    console.time("run conversion 1")
    await converter.run()
    console.timeEnd("run conversion 1")
    const outputStream = createReadStream(outputPath1)
    outputStream.on("end", () => {
      console.log("we are done")
    })
    const response = await fetch(
      `http://localhost:4756?output=${outputPath2}`,
      {
        duplex: "half",
        method: "POST",
        body: outputStream,
      },
    )
    console.timeEnd("total conversion 1")

    const result = await response.text()
    assert.ok(result.length > 0)

    const stats = await stat(outputPath2)
    assert.ok(stats.isFile())
    assert.ok(stats.size > 0)

    await rm(outputPath1)
    await rm(outputPath2)
  })

  // this seems a lot slower
  void it.only("should be able to stream a conversion stream to a server", async () => {
    const inputPath = new URL(
      "./test-data/poemsbywomen_01__64kb.mp3",
      import.meta.url,
    ).pathname

    const outputPath = path.join(tmpdir(), `test-${Date.now()}.wav`)

    console.time("total conversion 2")
    const converter = new Converter()
    converter.createInputFromFile(inputPath)
    const outputStream = converter.createOutputStream({ f: "wav" })

    console.time("run conversion 2")
    const run = converter.run()
    outputStream.on("end", () => {
      console.log("we are done")
      console.timeEnd("run conversion 2")
    })
    const response = await fetch(`http://localhost:4756?output=${outputPath}`, {
      duplex: "half",
      method: "POST",
      body: outputStream,
    })

    await run
    console.timeEnd("total conversion 2")

    const result = await response.text()
    assert.ok(result.length > 0)

    const stats = await stat(outputPath)
    assert.ok(stats.isFile())
    assert.ok(stats.size > 0)

    await rm(outputPath)
  })
})

after(() => {
  if (basicServer) {
    basicServer.close()
  }
})
