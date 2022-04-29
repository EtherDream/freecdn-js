class UrlConf {
  private static nameClassMap: {[name: string] : ParamSub}

  public static init() {
    // 为了让代码更简洁，这里没有逐一引用各个参数对应的文件
    // 如果该列表定义在全局，会出现依赖顺序的问题
    this.nameClassMap = {
      // 参数优先级（越前面的参数优先执行）
      'data': ParamData,

      'open_timeout': ParamOpenTimeout,
      'recv_timeout': ParamRecvTimeout,
      'referrer_policy': ParamReferrerPolicy,
      'req_headers': ParamReqHeaders,
      'valid_status': ParamValidStatus,

      'pack': ParamPack,
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

  // 不带片段部分的 URL（可以是相对路径）
  public readonly url: string

  // URL 片段部分
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

    // 参数优先级: 全局参数 < 站点参数 < 文件参数 < URL 参数
    mergeMap(params, manifest.globalParams)

    // 站点参数
    const host = this.url[0] === '/' ? MY_HOST : getHostFromUrl(this.url)
    const hostParams = manifest.getParams('@host ' + host)
    if (hostParams) {
      mergeMap(params, hostParams)
    }

    // 文件参数
    mergeMap(params, this.fileParams)

    // URL 参数（定义在 # 后面）
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
