class ParamOpenTimeout extends ParamBase {

  public static parseConf(conf: string) {
    const time = parseTime(conf)
    if (isNaN(time)) {
      return 'invalid time format'
    }
    return [time]
  }


  private tid = 0


  public constructor(
    private readonly time: number,
  ) {
    super()
  }

  public onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    this.tid = setTimeout(() => {
      const delay = Math.max(this.time, 5000)
      fileLoader.loadNextUrl(delay)
    }, this.time)
  }

  public onResponse() {
    this.stopTimer()
  }

  public onError() {
    this.stopTimer()
  }

  public onAbort() {
    this.stopTimer()
  }

  private stopTimer() {
    if (this.tid > 0) {
      clearTimeout(this.tid)
      this.tid = 0
    }
  }
}
