class ParamExpires extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    const time = parseTime(conf)
    if (isNaN(time)) {
      return 'invalid time format'
    }
    const seconds = time / 1000 | 0
    return [seconds]
  }


  public constructor(
    private readonly seconds: number
  ) {
    super()
  }

  public onResponse(resArgs: ResponseArgs) {
    resArgs.headers.append('cache-control', 'max-age=' + this.seconds)
  }
}
