class UrlConf {
  private static nameClassMap: {[name: string] : ParamSub}

  public static init() {
    this.nameClassMap = {
      // priority: high to low
      'open_timeout': ParamOpenTimeout,
      'recv_timeout': ParamRecvTimeout,
      'referrer_policy': ParamReferrerPolicy,
      'req_headers': ParamReqHeaders,

      'headers': ParamHeaders,
      'expires': ParamExpires,
      'mime': ParamMime,
      'charset': ParamCharset,

      'pos': ParamPos,
      'size': ParamSize,
      'xor': ParamXor,
      'br': ParamBr,

      'prefix': ParamPrefix,
      'suffix': ParamSuffix,
      'hash': ParamHash,
      'stream': ParamStream,
    }
    Object.values(this.nameClassMap).forEach((cls, i) => {
      cls.priority = i
    })

    ParamMime.init()
  }

  /** relative or absolute url without fragment */
  public readonly url: string

  /** url fragment */
  public readonly frag: string | undefined


  public constructor(
    fullUrl: string,
    private readonly fileParams: params_t
  ) {
    [this.url, this.frag] = getPair(toRelUrl(fullUrl), '#')
  }

  public parse(manifest: Manifest) {
    // TODO: cache result
    const params = new Map<string, string>()

    // global < host < file < frag
    mergeMap(params, manifest.globalParams)

    const host = this.url[0] === '/' ? MY_HOST : getHostFromUrl(this.url)
    const hostParams = manifest.getParams('@host ' + host)
    if (hostParams) {
      mergeMap(params, hostParams)
    }

    mergeMap(params, this.fileParams)

    if (this.frag) {
      const urlParams = new URLSearchParams(this.frag)
      mergeMap(params, urlParams)
    }

    const mods: ParamBase[] = []

    for (const [k, v] of params) {
      const cls = UrlConf.nameClassMap[k]
      if (!cls) {
        console.warn('[FreeCDN/UrlConf] unknown param:', k)
        continue
      }
      const ret = cls.parseConf(v)
      if (ret === undefined) {
        continue
      }
      if (typeof ret === 'string') {
        console.warn('[FreeCDN/UrlConf] parseConf failed. mod:', k, 'err:', ret, 'conf:', v)
        continue
      }
      const obj = new cls(...ret)
      mods.push(obj)
    }

    mods.sort((a, b) =>
      ((a.constructor as ParamSub).priority as number) -
      ((b.constructor as ParamSub).priority as number)
    )
    return mods
  }
}
