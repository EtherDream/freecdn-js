type bundle_file_map_t = Map<string /* path */, Response>

class ParamBundle extends ParamBase {

  public static parseConf(conf: string) {
    if (conf === 'off') {
      return
    }
    if (!/^https?:|^\//.test(conf)) {
      return 'invalid url'
    }
    return [conf]
  }

  private static cacheMap = new Map<string /* pkgUrl */,
    may_async<bundle_file_map_t>
  >()


  public constructor(
    private readonly packUrl: string
  ) {
    super()
  }

  public async onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    if (fileLoader.cdn.isSubReq) {
      return
    }
    let fileMap: bundle_file_map_t

    const r = ParamBundle.cacheMap.get(this.packUrl)
    if (r === undefined) {
      const signal = promisex<bundle_file_map_t>()
      ParamBundle.cacheMap.set(this.packUrl, signal)

      fileMap = new Map()
      await this.loadPkg(fileLoader, fileMap)

      ParamBundle.cacheMap.set(this.packUrl, fileMap)
      signal.resolve(fileMap)

    } else if (isPromise(r)) {
      fileMap = await r
    } else {
      fileMap = r
    }

    const path = fileLoader.suffix || ''
    const res = fileMap.get(path)
    if (res) {
      return res.clone()
    }
    if (path === '') {
      const res = fileMap.get('index.html')
      if (res) {
        fileLoader.suffix = 'index.html'
        return res.clone()
      }
      return
    }
    if (path.endsWith('/')) {
      const res = fileMap.get(path + 'index.html')
      if (res) {
        fileLoader.suffix = path + 'index.html'
        return res.clone()
      }
      return
    }
    if (fileMap.has(path + '/index.html')) {
      fileLoader.suffix = path + '/index.html'
      return new Response("<script>location.pathname+='/'</script>")
    }
  }

  private async loadPkg(fileLoader: FileLoader, fileMap: bundle_file_map_t) {
    type conf_t = {
      [file: string]: {
        [headerName: string] : string | number
      }
    }

    // TODO: support stream
    const cdn = new FreeCDN()
    cdn.manifest = fileLoader.cdn.manifest
    cdn.weightConf = fileLoader.cdn.weightConf
    cdn.isSubReq = true

    let pkgBin: Uint8Array
    try {
      pkgBin = await cdn.fetchBin(this.packUrl)
    } catch {
      this.warn('failed to load')
      return
    }

    const pos = pkgBin.indexOf(13 /* '\r' */)
    if (pos === -1) {
      this.warn('missing header')
      return
    }
    const confBin = pkgBin.subarray(0, pos)
    const confMap: conf_t = parseJson(bytesToUtf8(confBin))
    if (!confMap) {
      this.warn('invalid header')
      return
    }

    const bodyBin = pkgBin.subarray(pos + 1)
    let offset = 0

    for (const [file, conf] of Object.entries(confMap)) {
      const len = +conf['content-length']
      if (!(len >= 0)) {
        this.warn('invalid content-length')
        return
      }
      if (offset + len > bodyBin.length) {
        this.warn('invalid offset')
        return
      }
      const fileBuf = bodyBin.subarray(offset, offset + len)
      const res = new Response(fileBuf, {
        headers: confMap[file] as HeadersInit
      })
      fileMap.set(file, res)

      offset += len
    }
  }

  private warn(msg: string) {
    console.warn('[FreeCDN/Bundle]', msg, this.packUrl)
  }
}