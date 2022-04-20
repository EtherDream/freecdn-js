class ParamRecvTimeout extends ParamBase {

  public static parseConf(conf: string) {
    const [n, t] = conf.split('/')
    const bytes = parseByteUnit(n)
    const time = parseTime(t)
    if (isNaN(bytes)) {
      return 'invalid byte format'
    }
    if (isNaN(time)) {
      return 'invalid time format'
    }
    return [bytes, time]
  }


  private fileLoader!: FileLoader
  private tid = 0
  private sum = 0

  public constructor(
    private readonly bytes: number,
    private readonly time: number,
  ) {
    super()
  }

  public onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    this.fileLoader = fileLoader
  }

  public onResponse() {
    this.tid = setInterval(() => {
      if (this.sum <= this.bytes) {
        this.stopTimer()
        this.fileLoader.loadNextUrl()
      }
      this.sum = 0
    }, this.time)
  }

  public onData(chunk: Uint8Array) {
    this.sum += chunk.length
    return chunk
  }

  public onEnd(chunk: Uint8Array) {
    this.stopTimer()
    return chunk
  }

  public onError() {
    this.stopTimer()
  }

  public onAbort() {
    this.stopTimer()
  }

  private stopTimer() {
    if (this.tid > 0) {
      clearInterval(this.tid)
      this.tid = 0
    }
  }
}
