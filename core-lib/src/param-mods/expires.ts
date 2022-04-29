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

  public onResponse(resArgs: ResponseArgs, fileLoader: FileLoader, rawRes: Response) {
    // 过期时间不小于实际值，防止经常变化的资源无法及时更新
    const rawMaxAge = (rawRes as any)._maxage
    const maxAge = rawMaxAge < this.seconds ? rawMaxAge : this.seconds

    resArgs.headers.append('cache-control', 'max-age=' + maxAge)
  }
}
