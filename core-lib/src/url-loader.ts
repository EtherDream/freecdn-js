class UrlLoader {
  private abortCtrl: AbortController | undefined

  private pauseSignal: PromiseX | undefined
  private isFetchDone = false

  public bytesRead = 0
  public onResponse!: (args: ResponseArgs) => void
  public onData!: (chunk: Uint8Array) => void
  public onEnd!: () => void
  public onError!: (err: Error) => void


  public constructor(
    public readonly url: string | undefined,
    private readonly paramMods: ParamBase[]) {
  }

  public async load(fileLoader: FileLoader) {
    let isNetErr = false
    let err: any
    try {
      // 网络错误（包括 fetch 被终止产生的错误）
      // 不同浏览器错误信息不同，因此不用 catch 判断，而是通过返回值
      err = await this.loadUnsafe(fileLoader)
      isNetErr = !!err
    } catch (e) {
      // 参数模块抛出的错误（也有可能是脚本错误）
      console.assert(e instanceof ParamError, e)
      err = e
    }

    if (err) {
      if (this.abortCtrl && !this.abortCtrl.signal.aborted) {
        for (const mod of this.paramMods) {
          mod.onError(err)
        }
        this.onError(err)

        if (!isNetErr) {
          this.abort(err)
        }
      }
    }
  }

  private async loadUnsafe(fileLoader: FileLoader) {
    const {rawReq} = fileLoader
    const {method} = rawReq
    const reqArgs: RequestArgs = {
      method,
      referrer: rawReq.referrer,
      referrerPolicy: 'same-origin',
      headers: new Headers(),
    }

    if (method === 'POST' || method === 'PUT') {
      reqArgs.body = await rawReq.clone().arrayBuffer()
    }

    let res: Response | void

    for (const mod of this.paramMods) {
      // 可直接返回响应（例如 data 参数、bundle 参数）
      const ret = mod.onRequest(reqArgs, fileLoader)
      if (ret) {
        res = isPromise(ret) ? await ret : ret
        if (res) {
          break
        }
      }
    }

    if (!res) {
      if (!this.url) {
        this.onError(Error('vURL no data'))
        return
      }
      this.abortCtrl = new AbortController()
      reqArgs.signal = this.abortCtrl.signal

      const req = new Request(this.url, reqArgs)
      try {
        res = await Network.fetch(req)
      } catch (err) {
        return err
      }
    }
    if (!res.body) {
      return Error('cors error')
    }

    const resArgs: ResponseArgs = {
      status: res.status,
      statusText: res.statusText,
      headers: new Headers(),
      contentLen: -1,
    }
    if (!res.headers.has('content-encoding')) {
      const contentLen = res.headers.get('content-length')
      if (contentLen) {
        resArgs.contentLen = +contentLen
      }
    }
    for (const mod of this.paramMods) {
      mod.onResponse(resArgs, fileLoader, res)
    }

    const contentRange = res.headers.get('content-range')
    if (contentRange) {
      const m = contentRange.match(/bytes (\d+)-/i)
      if (m) {
        const rangeBegin = +m[1]
        if (rangeBegin > 0) {
          this.bytesRead = rangeBegin
        }
      }
    }

    if (resArgs.contentLen !== -1) {
      resArgs.headers.set('content-length', resArgs.contentLen + '')
    }
    this.onResponse(resArgs)

    const reader = res.body.getReader()
    let buf: Uint8Array

    READ: for (;;) {
      try {
        const {value} = await reader.read()
        if (!value) {
          break
        }
        buf = value
      } catch (err) {
        return err
      }

      for (const mod of this.paramMods) {
        const ret = mod.onData(buf)
        buf = isPromise(ret) ? await ret : ret
        if (buf.length === 0) {
          continue READ
        }
      }

      if (buf.length > 0) {
        this.pauseSignal && await this.pauseSignal
        this.bytesRead += buf.length
        this.onData(buf)
      }
    } // READ NEXT

    this.isFetchDone = true
    buf = EMPTY_BUF

    for (const mod of this.paramMods) {
      const ret = mod.onEnd(buf)
      buf = isPromise(ret) ? await ret : ret
    }

    if (buf.length > 0) {
      this.pauseSignal && await this.pauseSignal
      this.bytesRead += buf.length
      this.onData(buf)
    }

    this.onEnd()
  }

  public pause() {
    this.pauseSignal = promisex()
  }

  public resume() {
    this.pauseSignal?.resolve()
    this.pauseSignal = undefined
  }

  public abort(reason: any) {
    if (this.isFetchDone) {
      return
    }
    this.abortCtrl?.abort()

    for (const mod of this.paramMods) {
      mod.onAbort(reason)
    }
  }
}
