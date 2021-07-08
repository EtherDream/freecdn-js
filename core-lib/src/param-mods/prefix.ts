class ParamPrefix extends ParamBase {

  public static parseConf(conf: string) {
    const bytes = parseStrOrB64(conf)
    if (!bytes) {
      return 'invalid format'
    }
    return [bytes]
  }


  private done = false

  public constructor(
    private readonly bytes: Uint8Array
  ) {
    super()
  }

  public onData(chunk: Uint8Array) {
    if (this.done) {
      return chunk
    }
    this.done = true
    return concatBufs([this.bytes, chunk])
  }

  public onEnd(chunk: Uint8Array) {
    // for empty file
    return this.onData(chunk)
  }
}
