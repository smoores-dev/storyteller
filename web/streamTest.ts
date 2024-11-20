const { open } = await import("node:fs/promises")

export async function test() {
  const h = await open(
    "/home/smoores/Downloads/debian-live-12.5.0-amd64-kde.zip",
  )
  const s = h.readableWebStream()
  const b = new Uint8Array(3479313227)
  let i = 0
  try {
    for await (const chunk of s) {
      const chunkArray = new Uint8Array(chunk as ArrayBuffer)
      b.set(chunkArray, i)
      i += chunkArray.byteLength
    }
  } catch (e) {
    console.error(e)
  } finally {
    console.log("done")
    await h.close()
    console.log("lastbyte", b[3479313205])
  }
}
