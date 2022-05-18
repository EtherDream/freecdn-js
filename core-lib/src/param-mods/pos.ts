class ParamPos extends ParamBase {

  public static parseConf(conf: string) {
    const pos = parseByteUnit(conf)
    if (isNaN(pos)) {
      return 'invalid byte format'
    }
    if (pos === 0) {
      return
    }
    return [pos]
  }


  public constructor(
    private remain: number
  ) {
    super()
  }

  public onResponse(resArgs: ResponseArgs) {
    if (resArgs.contentLen !== -1) {
      if ((resArgs.contentLen -= this.remain) < 0) {
        resArgs.contentLen = 0
      }
    }
  }

  public onData(chunk: Uint8Array) {
    if (this.remain <= 0) {
      return chunk
    }
    const remain = (this.remain -= chunk.length)
    if (remain >= 0) {
      return EMPTY_BUF
    }
    // if remain < 0, return last -remain bytes
    return chunk.subarray(remain)
  }

  public onEnd(chunk: Uint8Array) {
    return this.onData(chunk)
  }
}