class ParamReqHeaders extends ParamBase {
  public static reuse = true

  public static parse(conf: string) {
    const headers: [string, string][] = []

    // {"header-to-preserve": "", "header-to-add": "val"}
    const map = parseJson(conf)
    if (typeof map !== 'object') {
      return 'invalid format'
    }
    for (const [k, v] of Object.entries(map)) {
      if (typeof v !== 'string') {
        return 'invalid header'
      }
      headers.push([k, v])
    }
    return [headers]
  }

  public static parseConf(conf: string) {
    return this.parse(conf)
  }


  public constructor(
    private readonly headers: readonly [string, string][]
  ) {
    super()
  }

  public onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    for (const [k, v] of this.headers) {
      if (k === 'referer') {
        reqArgs.referrer = v || fileLoader.rawReq.referrer
        continue
      }
      if (v === '') {
        // preserve
        const rawVal = fileLoader.rawReq.headers.get(k)
        if (rawVal !== null) {
          reqArgs.headers.set(k, rawVal)
        }
      } else {
        // add
        reqArgs.headers.append(k, v)
      }
    }
  }
}
