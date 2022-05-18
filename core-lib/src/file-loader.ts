const FILE_BACKUP_PARAMS = [
  'open_timeout',
  'recv_timeout',
  'hash',
  'req_headers',
  'valid_status',
]

class FileLoaderError extends Error {
  public constructor(message: string) {
    super(message)
  }
  public urlErrs!: {url: string, err: Error}[]
}


class FileLoader {
  private readonly urlConfs: UrlConf[]
  private readonly urlLoaderSet = new Set<UrlLoader>()

  private vUrlConf: UrlConf | undefined

  private isPaused = false
  private isAborted = false
  private delayTid = 0
  private urlErrs: {url: string, err: Error}[] = []

  public readonly hasRange: boolean = false
  public readonly rangeBegin: number | undefined
  public readonly rangeEnd: number | undefined
  public readonly fileSize: number | undefined

  private opened = false
  private closed = false
  public bytesRead = 0

  public onOpen!: (args: ResponseArgs) => void
  public onData!: (chunk: Uint8Array) => void
  public onEnd!: () => void
  public onError!: (err: FileLoaderError) => void


  public constructor(
    public readonly fileConf: FileConf,
    public readonly rawReq: Request,
    public readonly cdn: FreeCDN,
    public range: string | null,
    public suffix: string
  ) {
    const fileParams = fileConf.params

    if (range) {
      const r = this.parseReqRange(range)
      if (r) {
        [this.rangeBegin, this.rangeEnd] = r
        this.hasRange = true
        this.bytesRead = this.rangeBegin
      }
      const fileSize = fileParams.get('size')
      if (fileSize) {
        this.fileSize = +fileSize
      }
    }

    if (fileParams.has('data') || fileParams.has('bundle') || fileParams.has('concat')) {
      this.vUrlConf = new UrlConf(undefined, fileParams)
    }

    // 原始 URL 作为后备资源
    // 禁止修改原始内容，因此只保留白名单中的参数
    const backupParams = new Map<string, string>()
    for (const k of FILE_BACKUP_PARAMS) {
      const v = fileParams.get(k)
      if (v !== undefined) {
        backupParams.set(k, v)
      }
    }
    const backupUrlConf = new UrlConf(fileConf.name, backupParams)

    this.urlConfs = fileConf.urlConfs.concat(backupUrlConf)
  }

  private parseReqRange(range: string) {
    // 目前只考虑 `bytes=begin-end` 和 `bytes=begin-` 格式
    const m = range.match(/bytes=(\d+)-(\d*)/i)
    if (!m) {
      return
    }
    const begin = +m[1]
    const end = +m[2]   // +'' === 0

    if (end !== 0 && end <= begin) {
      return
    }
    return [begin, end]
  }

  private buildResRange(resArgs: ResponseArgs) {
    const begin = this.rangeBegin as number
    let end = 0
    if (this.rangeEnd) {
      end = this.rangeEnd - 1
    } else if (this.fileSize) {
      end = this.fileSize - 1
    } else if (resArgs.contentLen > 0) {
      end = resArgs.contentLen
    }
    const val = 'bytes ' + begin + '-' + end + '/' + (this.fileSize || '*')

    // TODO: status 416
    resArgs.status = 206
    resArgs.headers.set('content-range', val)

    if (end > 0) {
      const len = end - begin + 1
      resArgs.headers.set('content-length', len + '')
    }
  }

  public open() {
    this.loadNextUrl()
  }

  public pause() {
    if (this.isPaused) {
      return
    }
    this.isPaused = true

    // TODO: 进度落后的 Loader 无需暂停
    for (const urlLoader of this.urlLoaderSet) {
      urlLoader.pause()
    }
  }

  public resume() {
    if (!this.isPaused) {
      return
    }
    this.isPaused = false

    for (const urlLoader of this.urlLoaderSet) {
      urlLoader.resume()
    }
  }

  public abort(reason: any) {
    if (this.isAborted) {
      return
    }
    this.isAborted = true

    for (const urlLoader of this.urlLoaderSet) {
      urlLoader.abort(reason)
    }
    if (this.delayTid !== 0) {
      clearTimeout(this.delayTid)
    }
  }

  private getNextUrl() {
    // 优先使用虚拟 URL（例如存在 data 参数时，无需使用真实 URL）
    const {vUrlConf} = this
    if (vUrlConf) {
      this.vUrlConf = undefined
      return {weight: 100, conf: vUrlConf}
    }

    const {urlConfs} = this
    const lastIndex = urlConfs.length - 1
    if (lastIndex === -1) {
      return
    }
    const now = getTimeSec()
    let weight = -10000
    let index = 0

    urlConfs.forEach((conf, i) => {
      const w = Network.getUrlWeight(conf.url as string, now, this.cdn.weightConf)
      if (w > weight) {
        weight = w
        index = i
      }
    })

    // 删除 urlConfs[index]
    const conf = urlConfs[index]
    urlConfs[index] = urlConfs[lastIndex]
    urlConfs.length = lastIndex

    return {weight, conf}
  }

  public loadNextUrl(delay = 0) {
    const ret = this.getNextUrl()
    if (!ret) {
      if (this.urlLoaderSet.size === 0) {
        const err = new FileLoaderError('failed to load: ' + this.getSourceUrl())
        err.urlErrs = this.urlErrs
        this.onError(err)
      }
      return
    }
    const {weight, conf} = ret

    if (weight < 0 && delay > 0) {
      // 并行加载多个备用 URL 时，推迟低权重的站点（例如当前站点、收费站点）
      this.delayTid = setTimeout(() => {
        this.delayTid = 0
        this.createUrlLoader(conf)
      }, delay)
      return
    }
    this.createUrlLoader(conf)
  }

  public getSourceUrl() {
    return this.fileConf.name + this.suffix
  }

  private getTargetUrl(url: string) {
    if (url.endsWith('/')) {
      return url + this.suffix
    }
    return url
  }

  private createUrlLoader(urlConf: UrlConf) {
    const url = urlConf.url && this.getTargetUrl(urlConf.url)
    const mods = urlConf.parse(this.cdn.manifest as Manifest)

    const urlLoader = new UrlLoader(url, mods)
    this.urlLoaderSet.add(urlLoader)

    urlLoader.onData = (chunk) => {
      if (this.closed) {
        return
      }
      const add = urlLoader.bytesRead - this.bytesRead
      if (add <= 0) {
        // 当前节点的进度落后于总进度，丢弃收到的数据
        return
      }
      if (add !== chunk.length) {
        chunk = chunk.subarray(-add)
      }
      this.bytesRead = urlLoader.bytesRead

      if (this.rangeEnd) {
        const exceed = this.bytesRead - this.rangeEnd
        if (exceed > 0) {
          chunk = chunk.subarray(0, -exceed)
          this.onData(chunk)
          urlLoader.onEnd()
          return
        }
      }
      this.onData(chunk)
    }

    urlLoader.onEnd = () => {
      if (this.closed) {
        return
      }
      this.closed = true
      this.onEnd()
      this.abort('TASK_DONE')
    }

    urlLoader.onError = (err) => {
      this.urlErrs.push({url: urlLoader.url || '', err})
      this.urlLoaderSet.delete(urlLoader)
      this.loadNextUrl()
    }

    urlLoader.onResponse = (resArgs) => {
      if (this.opened) {
        return
      }
      if (this.hasRange) {
        this.buildResRange(resArgs)
      }
      this.opened = true
      this.onOpen(resArgs)
    }

    urlLoader.load(this)
  }
}
