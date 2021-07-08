class ParamExpires extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    const seconds = parseTime(conf) / 1000 | 0
    if (isNaN(seconds)) {
      return 'invalid time format'
    }
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
