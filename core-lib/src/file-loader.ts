const BACKUP_PARAMS = ['open_timeout', 'recv_timeout', 'hash']


class FileLoaderError extends Error {
  public constructor(message: string) {
    super(message)
  }
  public urlErrs: {url: string, err: Error}[]
}


class FileLoader {
  private readonly urlConfs: UrlConf[]
  private readonly urlLoaderSet = new Set<UrlLoader>()

  private delayTid = 0
  private urlErrs: {url: string, err: Error}[] = []

  private readonly hasRange: boolean
  private readonly rangeBegin: number
  private readonly rangeEnd: number
  private readonly fileSize: number

  private opened = false
  private closed = false
  private bytesRead = 0

  public onOpen: (args: ResponseArgs) => void
  public onData: (chunk: Uint8Array) => void
  public onEnd: () => void
  public onError: (err: FileLoaderError) => void


  public constructor(
    public readonly fileConf: FileConf,
    public readonly rawReq: Request,
    public readonly manifest: Manifest
  ) {
    const range = rawReq.headers.get('range')
    if (range) {
      const r = this.parseReqRange(range)
      if (r) {
        [this.rangeBegin, this.rangeEnd] = r
        this.hasRange = true
        this.bytesRead = this.rangeBegin
      }

      const fileSize = fileConf.params.get('size')
      if (fileSize) {
        this.fileSize = +fileSize
      }
    }

    // 原始 URL 作为后备资源
    const backupParams = new Map<string, string>()
    for (const k of BACKUP_PARAMS) {
      const v = fileConf.params.get(k)
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
    let end = 0
    if (this.rangeEnd !== 0) {
      end = this.rangeEnd - 1
    } else if (this.fileSize) {
      end = this.fileSize - 1
    }
    const val = 'bytes ' + this.rangeBegin + '-' + end + '/' + (this.fileSize || '*')

    // TODO: status 416
    resArgs.status = 206
    resArgs.headers.set('content-range', val)
  }

  public open() {
    this.loadNextUrl()
  }

  public pause() {
    for (const urlLoader of this.urlLoaderSet) {
      urlLoader.pause()
    }
  }

  public resume() {
    for (const urlLoader of this.urlLoaderSet) {
      urlLoader.resume()
    }
  }

  public abort(reason: any) {
    for (const urlLoader of this.urlLoaderSet) {
      urlLoader.abort(reason)
    }
    if (this.delayTid !== 0) {
      clearTimeout(this.delayTid)
    }
  }

  private getNextUrl() {
    const {urlConfs} = this
    const lastIndex = urlConfs.length - 1
    if (lastIndex === -1) {
      return
    }
    const now = getTimeSec()
    let score = -10000
    let index = 0

    urlConfs.forEach((v, i) => {
      const s = Network.getUrlScore(v.url, now)
      if (s > score) {
        score = s
        index = i
      }
    })

    // swap and pop
    const conf = urlConfs[index]
    urlConfs[index] = urlConfs[lastIndex]
    urlConfs.length = lastIndex

    return {score, conf}
  }

  public loadNextUrl(delay = 0) {
    const ret = this.getNextUrl()
    if (!ret) {
      if (this.urlLoaderSet.size === 0) {
        const err = new FileLoaderError('failed to load: ' + this.fileConf.name)
        err.urlErrs = this.urlErrs
        this.onError(err)
      }
      return
    }
    const {score, conf} = ret

    if (score < 0 && delay > 0) {
      // 同时加载多个备用 URL 时推迟当前站点，避免浪费流量
      this.delayTid = setTimeout(() => {
        this.delayTid = 0
        this.createUrlLoader(conf)
      }, delay)
      return
    }
    this.createUrlLoader(conf)
  }

  private createUrlLoader(urlConf: UrlConf) {
    const urlLoader = new UrlLoader(urlConf, this.manifest)
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
      this.urlErrs.push({url: urlLoader.url, err})
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

    urlLoader.request(this)
  }
}
