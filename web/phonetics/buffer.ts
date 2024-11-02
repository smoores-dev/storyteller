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
    this.ensureBufferSize(id + data.length + space)
    this.buf.write(data, id, "utf-8")
    this.buf.fill(0, id + data.length, id + data.length + space)
    this.items.set(id, {
      from: id,
      to: id + data.length,
      space,
    })
  }

  // rawWrite only happens when we know there's enough
  // space, so we don't need to ensure the buffer size
  private rawWrite(data: string, id: number) {
    const item = this.items.get(id)
    if (!item) throw new Error("tried to retrieve item by nonexistent id")
    const index = item.to
    for (let i = index; i < index + data.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      this.buf.write(data[i - index]!, i, "utf-8")
    }
    return data.length
  }

  private rawAppend(data: string, space: number) {
    this.ensureBufferSize(this.index + data.length + space)
    this.buf.write(data, this.index, "utf-8")
    this.buf.fill(0, this.index + data.length, space)
    this.index += data.length + space
  }

  add(data: string) {
    const currentIndex = this.index
    this.rawAdd(data, data.length, currentIndex)
    this.index += data.length * 2

    return currentIndex
  }

  addWithSpace(data: string, space: number) {
    if (space < 0) {
      throw new Error("space must be >=0")
    }

    const currentIndex = this.index
    this.rawAdd(data, space, currentIndex)
    this.index += data.length + space

    return currentIndex
  }

  copy(id: number) {
    const item = this.items.get(id)
    if (!item) throw new Error("tried to retrieve item by nonexistent id")
    const currentIndex = this.index
    const data = this.buf.toString("utf-8", item.from, item.to)
    this.rawAdd(data, item.space, currentIndex)
    this.index += data.length + item.space
    return currentIndex
  }

  append(id: number, data: string) {
    const item = this.items.get(id)
    if (!item) throw new Error("tried to retrieve item by nonexistent id")
    if (item.space >= data.length) {
      const written = this.rawWrite(data, id)
      item.to += written
      item.space -= written
      return
    }

    const oldData = this.buf.toString("utf-8", item.from, item.to)
    const dataLength = oldData.length + data.length
    const from = this.index
    this.rawAppend(oldData, 0)
    this.rawAppend(data, data.length)
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
