class ParamConcat extends ParamBase {

  public static parseConf(conf: string) {
    if (conf === 'off') {
      return
    }
    const urls = splitList(conf)
    if (urls.length === 0) {
      return 'missing url'
    }
    let partLen = parseByteUnit(urls[0])
    if (partLen > 0) {
      urls.shift()
    } else {
      partLen = -1
    }
    for (const url of urls) {
      if (!/^https?:|^\//.test(url)) {
        return 'invalid url'
      }
    }
    return [partLen, urls]
  }


  public constructor(
    private readonly partLen: number,
    private readonly urls: string
  ) {
    super()
  }

  private abortCtrl: AbortController | undefined

  public async onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    if (fileLoader.cdn.isSubReq) {
      return
    }
    const manifest = fileLoader.cdn.manifest!
    const fileInfos: {url: string, size: number}[] = []

    const REG_WILDCARD = /\[(\d+)-(\d+)\]/

    for (const url of this.urls) {
      let beginNum = 0
      let endNum = 0
      let padNum = 0

      // 通配格式 [begin-end]
      // begin 左侧可有多个 0，用于固定数字长度
      const m = url.match(REG_WILDCARD)
      if (m) {
        const beginStr = m[1]
        beginNum = +beginStr
        endNum = +m[2]
        padNum = beginStr[0] === '0' ? beginStr.length : 0
      }

      for (let i = beginNum; i <= endNum; i++) {
        const realUrl = m
          ? url.replace(REG_WILDCARD, (i + '').padStart(padNum, '0'))
          : url

        const fileConf = manifest.get(realUrl)
        if (fileConf) {
          fileConf.parse()

          // 如果文件在清单中，优先使用 size 参数作为长度
          const size = fileConf.params.get('size')
          fileInfos.push({
            url: fileConf.name,
            size: size ? +size : this.partLen,
          })
        } else {
          fileInfos.push({url: realUrl, size: this.partLen})
        }
      }
    }
    fileInfos.reverse()

    const headers = new Headers()

    // 排除 range 之前的文件
    const {rangeBegin} = fileLoader
    if (rangeBegin && rangeBegin > 0) {
      let pos = 0

      for (let i = fileInfos.length - 1; i >= 0; i--) {
        const {size} = fileInfos[i]
        if (size === -1) {
          // 文件长度未知，停止排除
          break
        }
        if (pos + size > rangeBegin) {
          // 当前文件多余部分由 FileLoader 丢弃
          if (pos) {
            headers.set('content-range', `bytes ${pos}-/*`)
          }
          break
        }
        fileInfos.pop()
        pos += size
      }
    }

    const cdn = new FreeCDN()
    cdn.manifest = fileLoader.cdn.manifest
    cdn.weightConf = fileLoader.cdn.weightConf
    cdn.isSubReq = true

    let reader: ReadableStreamDefaultReader<Uint8Array>
    let controller: ReadableStreamDefaultController<Uint8Array>

    const openNextFile = async() => {
      const info = fileInfos.pop()
      if (!info) {
        controller.close()
        return false
      }
      this.abortCtrl = new AbortController()

      let res: Response
      try {
        res = await cdn.fetch(info.url, {
          signal: this.abortCtrl.signal,
        })
      } catch (err) {
        controller.error(err)
        return false
      }
      if (!res.body) {
        return Error('no body')
      }
      reader = res.body.getReader()
      return true
    }

    const readNextChunk = async() => {
      let buf: Uint8Array | undefined
      try {
        const {value} = await reader.read()
        buf = value
      } catch (err) {
        controller.error(err)
        return
      }
      if (buf) {
        controller.enqueue(buf)
      } else {
        if (await openNextFile()) {
          await readNextChunk()
        }
      }
    }

    const stream = new ReadableStream({
      async start(c: typeof controller) {
        controller = c
        await openNextFile()
      },
      pull: readNextChunk,
    })
    return new Response(stream, {headers})
  }

  public onAbort(reason: any) {
    if (this.abortCtrl) {
      this.abortCtrl.abort(reason)
      this.abortCtrl = undefined
    }
  }
}