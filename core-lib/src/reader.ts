class ReaderError extends Error {
  public constructor(message: string) {
    super(message)
  }
}

class Reader {
  /*
   * chunks:
   * |-------------------------------------|
   * | 0                 |  1  |  2  | ... |
   * | used       : free | ... | ... | ... |
   * |<- offset -> <------ availLen ------>|
   */
  private readonly chunks: Uint8Array[] = []
  private offset = 0

  public availLen = 0
  public source?: ReadableStreamDefaultReader<Uint8Array>


  private async pull(len: number) {
    do {
      let buf: Uint8Array | undefined
      try {
        const {value} = await this.source!.read()
        buf = value
      } catch (err: any) {
        throw new ReaderError(err.message)
      }
      if (!buf) {
        return false
      }
      this.feed(buf)
    } while (this.availLen < len)
    return true
  }

  /**
   * @param chunk chunk.length > 0
   */
  public feed(chunk: Uint8Array) {
    this.chunks.push(chunk)
    this.availLen += chunk.length
  }

  /**
   * @param len len > 0 && len <= availLen
   */
  public readBytesSync(len: number) {
    this.availLen -= len

    let ret: Uint8Array
    let pos = 0
    let i = 0

    if (this.offset) {
      const buf = this.chunks[0]
      const end = this.offset + len
      const slice = buf.subarray(this.offset, end)

      if (end < buf.length) {
        this.offset += len
        return slice
      }
      this.offset = 0

      if (end === buf.length) {
        this.chunks.shift()
        return slice
      }
      ret = new Uint8Array(len)
      ret.set(slice, 0)

      pos = slice.length
      i = 1
    } else {
      ret = new Uint8Array(len)
    }

    do {
      const buf = this.chunks[i]
      const end = pos + buf.length

      const exceed = end - len
      if (exceed > 0) {
        const head = buf.subarray(0, -exceed)
        ret.set(head, pos)
        this.offset = head.length
        break
      }
      ret.set(buf, pos)
      pos = end
      i++
    } while (pos < len)

    this.chunks.splice(0, i)
    return ret
  }

  public async readBytesAsync(len: number) {
    if (this.availLen < len) {
      await this.pull(len)
    }
    return this.readBytesSync(len)
  }

  //
  // 如果 chunk0 读完还有剩余，可直接读取，性能更高（大概率）
  // 如果正好读完，或不够读取，则需额外操作
  //
  public readU32Sync() {
    let pos = this.offset
    let buf = this.chunks[0]
    if (buf.length - pos > 4) {
      this.offset += 4
      this.availLen -= 4
    } else {
      buf = this.readBytesSync(4)
      pos = 0
    }
    return (
      buf[pos + 3] << 24 |
      buf[pos + 2] << 16 |
      buf[pos + 1] <<  8 |
      buf[pos]
    ) >>> 0
  }

  public readU16Sync() {
    let pos = this.offset
    let buf = this.chunks[0]
    if (buf.length - pos > 2) {
      this.offset += 2
      this.availLen -= 2
    } else {
      buf = this.readBytesSync(2)
      pos = 0
    }
    return (
      buf[pos + 1] << 8 |
      buf[pos]
    )
  }

  public readU8Sync() {
    let pos = this.offset
    let buf = this.chunks[0]
    if (buf.length - pos > 1) {
      this.offset += 1
      this.availLen -= 1
    } else {
      buf = this.readBytesSync(1)
      pos = 0
    }
    return buf[pos]
  }

  public async readU32Async() {
    if (this.availLen < 4) {
      await this.pull(4)
    }
    return this.readU16Sync()
  }

  public async readU16Async() {
    if (this.availLen < 2) {
      await this.pull(2)
    }
    return this.readU16Sync()
  }

  public async readU8Async() {
    if (this.availLen < 1) {
      await this.pull(1)
    }
    return this.readU8Sync()
  }

  public async findAsync(byte: number) {
    if (this.offset) {
      const pos = this.chunks[0].indexOf(byte, this.offset)
      if (pos !== -1) {
        return pos - this.offset
      }
    }
    let sum = this.offset
    let i = 0

    for (;;) {
      let buf = this.chunks[i]
      if (!buf) {
        if (!await this.pull(1)) {
          break
        }
        buf = this.chunks[i]
      }
      const pos = buf.indexOf(byte)
      if (pos !== -1) {
        return sum + pos
      }
      sum += buf.length
      i++
    }
    return -1
  }
}