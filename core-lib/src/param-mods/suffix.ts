class ParamSuffix extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    const bytes = parseStrOrB64(conf)
    if (!bytes) {
      return 'invalid format'
    }
    return [bytes]
  }


  public constructor(
    private readonly bytes: Uint8Array
  ) {
    super()
  }

  public onResponse(resArgs: ResponseArgs) {
    if (resArgs.contentLen >= 0) {
      resArgs.contentLen += this.bytes.length
    }
  }

  public onEnd(chunk: Uint8Array) {
    if (chunk.length === 0) {
      return this.bytes
    }
    return concatBufs([chunk, this.bytes])
  }
}
