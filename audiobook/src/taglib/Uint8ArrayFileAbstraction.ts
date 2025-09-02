import {
  ByteVector,
  type IFileAbstraction,
  type IStream,
  SeekOrigin,
} from "node-taglib-sharp"

export class Uint8ArrayStream implements IStream {
  public position = 0
  public length: number

  constructor(
    private fileAbstraction: Uint8ArrayFileAbstraction,
    public canWrite: boolean,
  ) {
    this.length = fileAbstraction.data.length
  }

  read(buffer: Uint8Array, bufferOffset: number, length: number): number {
    const availableBytes = this.fileAbstraction.data.length - this.position
    const bytesToRead = Math.min(length, availableBytes)

    if (bytesToRead <= 0) {
      return 0
    }

    buffer.set(
      this.fileAbstraction.data.subarray(
        this.position,
        this.position + bytesToRead,
      ),
      bufferOffset,
    )

    this.position += bytesToRead
    return bytesToRead
  }

  seek(offset: number, origin: SeekOrigin) {
    switch (origin) {
      case SeekOrigin.Begin:
        this.position = offset
        break
      case SeekOrigin.Current:
        this.position += offset
        break
      case SeekOrigin.End:
        this.position = this.length + offset
        break
    }
  }

  setLength(length: number) {
    if (!this.canWrite) {
      throw new Error("Invalid operation: this stream is a read-only stream")
    }
    if (length === this.length) {
      return
    }
    const newData = new Uint8Array(length)

    if (length > 0) {
      const bytesToCopy = Math.min(this.fileAbstraction.data.length, length)
      newData.set(this.fileAbstraction.data.subarray(0, bytesToCopy))
    }

    this.fileAbstraction.data = newData

    if (this.position > length) {
      this.position = length
    }
    this.length = length
  }

  write(buffer: Uint8Array, bufferOffset: number, length: number): number {
    if (buffer instanceof ByteVector) {
      // As far as I know, we have no choice here, despite deprecation
      /* eslint-disable-next-line @typescript-eslint/no-deprecated */
      buffer = buffer.toByteArray()
    }
    if (!this.canWrite) {
      throw new Error("Invalid operation: this stream is a read-only stream")
    }

    const bytesToWrite = Math.min(buffer.length - bufferOffset, length)

    const originalLength = this.length
    if (this.position + bytesToWrite > originalLength) {
      this.setLength(this.position + bytesToWrite)
    }

    this.fileAbstraction.data.set(
      buffer.subarray(bufferOffset, bytesToWrite),
      this.position,
    )

    this.position += bytesToWrite

    return bytesToWrite
  }

  close() {}

  static createAsRead(fileAbstraction: Uint8ArrayFileAbstraction) {
    return new Uint8ArrayStream(fileAbstraction, false)
  }

  static createAsReadWrite(fileAbstraction: Uint8ArrayFileAbstraction) {
    return new Uint8ArrayStream(fileAbstraction, true)
  }
}

export class Uint8ArrayFileAbstraction implements IFileAbstraction {
  constructor(
    public name: string,
    public data: Uint8Array,
  ) {}

  get readStream(): IStream {
    return Uint8ArrayStream.createAsRead(this)
  }

  get writeStream(): IStream {
    return Uint8ArrayStream.createAsReadWrite(this)
  }

  closeStream(stream: IStream): void {
    stream.close()
  }
}
