class ParamMime extends ParamBase {
  public static reuse = true

  private static extTypeMap: ReadonlyMap<string, string>

  public static init() {
    const map = new Map<string, string>()

    for (const item of MIME_DATA.split(';')) {
      const [mime, exts] = getPair(item, ':') as string[]

      for (const ext of exts.split(',')) {
        map.set(ext, mime)
      }
    }
    this.extTypeMap = map
  }

  public static parseConf(conf: string) {
    if (conf === 'auto') {
      // likely
      return ['']
    }
    return [conf]
  }


  public constructor(
    private readonly mime: string
  ) {
    super()
  }

  public onResponse(resArgs: ResponseArgs, fileLoader: FileLoader) {
    let type: string | undefined

    if (this.mime === '') {
      const m = fileLoader.fileConf.name.match(/\.(\w+)$/)
      if (m) {
        const ext = m[1].toLowerCase()
        type = ParamMime.extTypeMap.get(ext)
      }
      if (!type) {
        type = 'application/octet-stream'
      }
    } else {
      type = this.mime
    }
    resArgs.headers.set('content-type', type)
  }
}
