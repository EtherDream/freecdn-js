class ParamStream extends ParamBase {

  public static parseConf(conf: string) {
    if (conf === 'on') {
      // default
      return
    }
    if (conf === 'off') {
      return []
    }
    return 'invalid value'
  }


  private readonly queueArr: Uint8Array[] = []
  private queueLen = 0

  public constructor() {
    super()
  }

  public onData(chunk: Uint8Array) {
    this.queueLen += chunk.length
    if (this.queueLen > LEN.MAX_QUEUE) {
      throw new ParamError('max queue length exceeded')
    }
    this.queueArr.push(chunk)
    return EMPTY_BUF
  }

  public onEnd(chunk: Uint8Array) {
    if (chunk.length > 0) {
      // unlikely
      this.onData(chunk)
    }
    return concatBufs(this.queueArr, this.queueLen)
  }
}
