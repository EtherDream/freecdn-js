class ParamHeaders extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    return ParamReqHeaders.parse(conf)
  }


  public constructor(
    private readonly headers: readonly [string, string][],
    private readonly preserveAll: boolean
  ) {
    super()
  }

  public onResponse(resArgs: ResponseArgs, fileLoader: FileLoader, rawRes: Response) {
    if (this.preserveAll) {
      for (const [k, v] of rawRes.headers) {
        resArgs.headers.set(k, v)
      }
      for (const [k, v] of this.headers) {
        resArgs.headers.set(k, v)
      }
      return
    }

    for (const [k, v] of this.headers) {
      if (v === '') {
        // preserve
        const rawVal = rawRes.headers.get(k)
        if (rawVal !== null) {
          resArgs.headers.set(k, rawVal)
        }
      } else {
        // add
        resArgs.headers.set(k, v)
      }
    }
  }
}
