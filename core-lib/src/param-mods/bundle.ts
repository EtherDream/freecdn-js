const enum ParamBundleState {
  LOADING = 1,
}
type bundle_file_map_value_t = Response | PromiseX<Response> | ParamBundleState.LOADING

type bundle_file_map_t = Map<string /* path */, bundle_file_map_value_t>

type bundle_cache_t = bundle_file_map_t | PromiseX<bundle_file_map_t>


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

  private static cache = new Map<string /* pkgUrl */, bundle_cache_t>()


  public constructor(
    private readonly packUrl: string
  ) {
    super()
  }

  public async onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    if (fileLoader.cdn.isSubReq) {
      return
    }
    let fileMap = ParamBundle.cache.get(this.packUrl)
    if (!fileMap) {
      // init
      fileMap = promisex()
      ParamBundle.cache.set(this.packUrl, fileMap)

      this.loadPkg(fileLoader, fileMap)
        .catch(fileMap.reject.bind(fileMap))
    }

    if (isPromise(fileMap)) {
      try {
        fileMap = await fileMap
      } catch (err) {
        if (typeof err === 'string') {
          this.warn(err)
        } else {
          console.assert(err instanceof ReaderError, err)
        }
        return
      }
    }

    let res: bundle_file_map_value_t | undefined

    for (;;) {
      const path = fileLoader.suffix
      res = fileMap.get(path)
      if (res) {
        break
      }
      if (path === '') {
        res = fileMap.get('index.html')
        if (res) {
          fileLoader.suffix = 'index.html'
        }
        break
      }
      if (path.endsWith('/')) {
        res = fileMap.get(path + 'index.html')
        if (res) {
          fileLoader.suffix = path + 'index.html'
        }
        break
      }
      if (fileMap.has(path + '/index.html')) {
        fileLoader.suffix = path + '/index.html'
        return new Response("<script>location.pathname+='/'</script>")
      }
      break
    }
    if (!res) {
      return
    }
    if (res === ParamBundleState.LOADING) {
      // register callback
      res = promisex()
      fileMap.set(fileLoader.suffix, res)
    }
    if (isPromise(res)) {
      res = await res
    }
    return res.clone()
  }

  private async loadPkg(fileLoader: FileLoader, fileMapSignal: PromiseX<bundle_file_map_t>) {
    type conf_t = {
      [file: string]: {
        [headerName: string] : string | number
      }
    }
    const fileMap: bundle_file_map_t = new Map()

    const cdn = new FreeCDN()
    cdn.manifest = fileLoader.cdn.manifest
    cdn.weightConf = fileLoader.cdn.weightConf
    cdn.isSubReq = true

    const reader = new Reader()
    try {
      const res = await cdn.fetch(this.packUrl)
      reader.source = res.body!.getReader()
    } catch {
      throw 'failed to load'
    }

    // delimiter `\r`
    const delimPos = await reader.findAsync(13)
    if (delimPos === -1) {
      throw 'missing header'
    }
    const confBin = await reader.readBytesAsync(delimPos + 1)
    const confMap: conf_t = parseJson(bytesToUtf8(confBin))
    if (!confMap || typeof confMap !== 'object') {
      throw 'invalid header'
    }

    for (const path of Object.keys(confMap)) {
      fileMap.set(path, ParamBundleState.LOADING)
    }
    fileMapSignal.resolve(fileMap)

    for (const [path, headers] of Object.entries(confMap)) {
      const fileLen = +headers['content-length']
      if (!(fileLen >= 0)) {
        throw 'invalid content-length'
      }
      const fileBuf = await reader.readBytesAsync(fileLen)

      const res = new Response(fileBuf, {
        headers: confMap[path] as HeadersInit,
      })
      const signal = fileMap.get(path)
      if (signal !== ParamBundleState.LOADING) {
        (signal as PromiseX<Response>).resolve(res)
      }
      fileMap.set(path, res)
    }
  }

  private warn(msg: string) {
    console.warn('[FreeCDN/Bundle]', msg, this.packUrl)
  }
}