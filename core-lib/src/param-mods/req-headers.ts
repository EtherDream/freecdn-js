class ParamReqHeaders extends ParamBase {
  public static reuse = true

  public static parse(conf: string) {
    const headers: [string, string][] = []
    let preserveAll = false

    // {"header-to-preserve": "", "header-to-add": "val"}
    const map = parseJson(conf)
    if (typeof map !== 'object') {
      return 'invalid format'
    }
    for (const [k, v] of Object.entries(map)) {
      if (k === '*') {
        preserveAll = true
      } else {
        headers.push([k, v + ''])
      }
    }
    return [headers, preserveAll]
  }

  public static parseConf(conf: string) {
    return this.parse(conf)
  }


  public constructor(
    private readonly headers: readonly [string, string][],
    private readonly preserveAll: boolean
  ) {
    super()
  }

  public onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    const {rawReq} = fileLoader

    if (this.preserveAll) {
      for (const [k, v] of rawReq.headers) {
        reqArgs.headers.set(k, v)
      }
      for (const [k, v] of this.headers) {
        reqArgs.headers.set(k, v)
      }
      return
    }

    for (const [k, v] of this.headers) {
      if (k === 'referer') {
        reqArgs.referrer = v || rawReq.referrer
        continue
      }
      if (v === '') {
        // preserve
        const rawVal = rawReq.headers.get(k)
        if (rawVal !== null) {
          reqArgs.headers.set(k, rawVal)
        }
      } else {
        // add
        reqArgs.headers.set(k, v)
      }
    }
  }
}
