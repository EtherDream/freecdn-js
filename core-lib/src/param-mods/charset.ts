const REG_TEXT_MIME = /^text\/|^application\/(?:javascript|json)|\+xml$/


class ParamCharset extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    if (conf !== 'off') {
      return [conf]
    }
  }


  public constructor(
    private readonly charset: string
  ) {
    super()
  }

  public onResponse(resArgs: ResponseArgs) {
    const type = resArgs.headers.get('content-type') || ''
    if (REG_TEXT_MIME.test(type)) {
      resArgs.headers.set('content-type', type + '; charset=' + this.charset)
    }
  }
}
