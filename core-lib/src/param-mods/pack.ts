type PackFileInfo = [offset: number, len: number]

class ParamPack extends ParamBase {

  public static parseConf(conf: string) {
    if (conf === 'off') {
      return
    }
    if (conf === 'on') {
      return []
    }
    return 'invalid value'
  }

  private static cache = new Map<string, {
    headerLen: number,
    fileInfoMap: Map<string, PackFileInfo>,
  }>()

  private url!: string
  private file!: string
  private queue!: Uint8Array[]

  private headerParsed = false
  private offset = 0
  private len = 0


  public constructor() {
    super()
  }

  public onResponse(resArgs: ResponseArgs, fileLoader: FileLoader, rawRes: Response) {
    let file = fileLoader.suffix
    if (file === null) {
      this.fatal('missing url suffix')
    }
    if (file === '' || file.endsWith('/')) {
      file += 'index.html'
      fileLoader.suffix = file
    }

    const packMap = ParamPack.cache.get(rawRes.url)
    if (packMap) {
      const info = packMap.fileInfoMap.get(file)
      if (!info) {
        this.fatal('missing file')
      }
      const [offset, len] = info
      this.offset = offset + packMap.headerLen
      this.len = len
      this.headerParsed = true
    } else {
      this.url = rawRes.url
      this.file = file
    }
  }

  public onData(chunk: Uint8Array) {
    if (!this.headerParsed) {
      return this.parseHeader(chunk)
    }
    return this.parseBody(chunk)
  }

  public onEnd(chunk: Uint8Array) {
    return this.onData(chunk)
  }

  private parseHeader(chunk: Uint8Array) {
    const end = chunk.indexOf(13)   // '\r'
    if (end === -1) {
      this.queuePush(chunk)
      return EMPTY_BUF
    }
    const prefix = chunk.subarray(0, end)
    const suffix = chunk.subarray(end + 1)

    const headerBin = this.queueFlush(prefix)
    const headerStr = bytesToUtf8(headerBin)

    if (!headerStr.startsWith('#PACKv1\n')) {
      this.fatal('bad magic code')
    }
    const lines = headerStr.slice(8, -1).split('\n')

    const fileInfoMap = new Map<string, PackFileInfo>()
    let offset = 0

    for (const line of lines) {
      const pos = line.lastIndexOf(':')
      if (pos === -1) {
        this.fatal('missing len')
      }
      const len = +line.substring(pos + 1)
      if (!(len >= 0)) {
        this.fatal('bad len')
      }
      const path = line.substring(0, pos)
      fileInfoMap.set(path, [offset, len])
      offset += len
    }

    ParamPack.cache.set(this.url, {
      headerLen: headerBin.length + 1,
      fileInfoMap,
    })

    const info = fileInfoMap.get(this.file)
    if (!info) {
      this.fatal('missing file')
    }
    [this.offset, this.len] = info

    this.headerParsed = true
    return this.parseBody(suffix)
  }

  private parseBody(chunk: Uint8Array) {
    if (this.len <= 0) {
      return EMPTY_BUF
    }

    if (this.offset > 0) {
      // like `pos` param
      const remain = (this.offset -= chunk.length)
      if (remain >= 0) {
        return EMPTY_BUF
      }
      chunk = chunk.subarray(remain)
    }

    // like `size` param
    const remain = (this.len -= chunk.length)
    if (remain >= 0) {
      return chunk
    }
    return chunk.subarray(0, remain)
  }

  private queuePush(chunk: Uint8Array) {
    if (this.queue) {
      this.queue.push(chunk)
    } else {
      this.queue = [chunk]
    }
  }

  private queueFlush(chunk: Uint8Array) {
    if (this.queue) {
      this.queue.push(chunk)
      chunk = concatBufs(this.queue)
      this.queue.length = 0
    }
    return chunk
  }

  private fatal(reason: string) : never {
    throw new ParamError('invalid pack file: ' + reason)
  }
}