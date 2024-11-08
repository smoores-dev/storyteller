type BufferItem = {
  from: number
  to: number
  space: number
}

export class CharBuffer {
  private buf: Buffer
  private index = 0
  private items: Map<number, BufferItem>

  constructor(length: number) {
    this.buf = Buffer.allocUnsafe(length)
    this.items = new Map()
  }

  private ensureBufferSize(toWrite: number) {
    if (this.buf.length < toWrite) {
      const oldBuf = this.buf
      this.buf = Buffer.allocUnsafe(oldBuf.length * 2)
      oldBuf.copy(this.buf)
    }
  }

  private rawAdd(data: string, space: number, id: number) {
    const size = Buffer.byteLength(data, "utf8")
    this.ensureBufferSize(id + size + space)
    this.buf.write(data, id, "utf-8")
    this.buf.fill(0, id + size, id + size + space)
    this.items.set(id, {
      from: id,
      to: id + size,
      space,
    })
  }

  // rawWrite only happens when we know there's enough
  // space, so we don't need to ensure the buffer size
  private rawWrite(data: string, id: number) {
    const size = Buffer.byteLength(data, "utf8")
    const item = this.items.get(id)
    if (!item) throw new Error("tried to retrieve item by nonexistent id")
    const index = item.to
    for (let i = index; i < index + data.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.buf.write(data[i - index]!, i, "utf-8")
    }
    return size
  }

  private rawAppend(data: string, space: number) {
    const size = Buffer.byteLength(data, "utf8")
    this.ensureBufferSize(this.index + size + space)
    this.buf.write(data, this.index, "utf-8")
    this.buf.fill(0, this.index + size, space)
    this.index += size + space
  }

  add(data: string) {
    const currentIndex = this.index
    const size = Buffer.byteLength(data, "utf8")
    this.rawAdd(data, size, currentIndex)
    this.index += size * 2

    return currentIndex
  }

  addWithSpace(data: string, space: number) {
    if (space < 0) {
      throw new Error("space must be >=0")
    }
    const size = Buffer.byteLength(data, "utf8")

    const currentIndex = this.index
    this.rawAdd(data, space, currentIndex)
    this.index += size + space

    return currentIndex
  }

  copy(id: number) {
    const item = this.items.get(id)
    if (!item) throw new Error("tried to retrieve item by nonexistent id")
    const currentIndex = this.index
    const data = this.buf.toString("utf-8", item.from, item.to)
    const size = Buffer.byteLength(data, "utf8")
    this.rawAdd(data, item.space, currentIndex)
    this.index += size + item.space
    return currentIndex
  }

  append(id: number, data: string) {
    const dataSize = Buffer.byteLength(data, "utf8")
    const item = this.items.get(id)
    if (!item) throw new Error("tried to retrieve item by nonexistent id")
    if (item.space >= dataSize) {
      const written = this.rawWrite(data, id)
      item.to += written
      item.space -= written
      return
    }

    const oldData = this.buf.toString("utf-8", item.from, item.to)
    const oldDataSize = Buffer.byteLength(oldData, "utf8")

    const dataLength = oldDataSize + dataSize
    const from = this.index
    this.rawAppend(oldData, 0)
    this.rawAppend(data, dataSize)
    item.from = from
    item.to = from + dataLength
    item.space = dataLength
  }

  get(id: number) {
    const item = this.items.get(id)
    if (!item) throw new Error("tried to retrieve item by nonexistent id")
    return this.buf.toString("utf-8", item.from, item.to)
  }
}
