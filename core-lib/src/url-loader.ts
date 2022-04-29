class UrlLoader {
  private readonly abortCtrl = new AbortController()

  private pauseSignal: PromiseX | undefined
  private isNetErr = false
  private isDone = false
  private isAborted = false

  public bytesRead = 0
  public onResponse!: (args: ResponseArgs) => void
  public onData!: (chunk: Uint8Array) => void
  public onEnd!: () => void
  public onError!: (err: Error) => void


  public constructor(
    public readonly url: string,
    private readonly paramMods: ParamBase[]) {
  }

  public async request(fileLoader: FileLoader) {
    let err: any
    try {
      err = await this.requestUnsafe(fileLoader)
    } catch (e) {
      console.assert(e instanceof ParamError, e)
      err = e
    }

    if (err && !this.isAborted) {
      for (const mod of this.paramMods) {
        mod.onError(err)
      }
      this.onError(err)

      // TODO: network.addError(err)

      if (!this.isNetErr) {
        this.abort(err)
      }
    }
  }

  private async requestUnsafe(fileLoader: FileLoader) {
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
      // 可直接返回响应（例如 data 参数、pack 参数存在缓存的时候）
      res = mod.onRequest(reqArgs, fileLoader)
      if (res) {
        break
      }
    }

    if (!res) {
      reqArgs.signal = this.abortCtrl.signal

      const req = new Request(this.url, reqArgs)
      try {
        res = await Network.fetch(req)
      } catch (err) {
        this.isNetErr = true
        return err
      }
    }

    const resArgs: ResponseArgs = {
      status: res.status,
      statusText: res.statusText,
      headers: new Headers(),
    }
    for (const mod of this.paramMods) {
      mod.onResponse(resArgs, fileLoader, res)
    }
    this.onResponse(resArgs)

    if (!res.body) {
      return new Error('cors error')
    }
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
        this.isNetErr = true
        return err
      }

      for (const mod of this.paramMods) {
        const ret = mod.onData(buf)

        // await is slow
        // https://gist.github.com/EtherDream/52649e4939008e149d0cb3a944c055b7
        buf = ret instanceof Promise ? await ret : ret

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

    this.isDone = true
    buf = EMPTY_BUF

    for (const mod of this.paramMods) {
      const ret = mod.onEnd(buf)
      buf = ret instanceof Promise ? await ret : ret
    }

    if (buf.length > 0) {
      this.pauseSignal && await this.pauseSignal
      this.bytesRead += buf.length
      this.onData(buf)
    }

    this.onEnd()
  }

  public pause() {
    console.assert(!this.pauseSignal)
    this.pauseSignal = promisex()
  }

  public resume() {
    this.pauseSignal?.resolve()
    this.pauseSignal = undefined
  }

  public abort(reason: any) {
    if (this.isDone) {
      return
    }
    this.isAborted = true
    this.abortCtrl.abort()

    for (const mod of this.paramMods) {
      mod.onAbort(reason)
    }
  }
}
