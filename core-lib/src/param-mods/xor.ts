class ParamXor extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    const key = +conf >>> 0
    if (key > 255) {
      return 'invalid value'
    }
    return [key]
  }


  public constructor(
    private readonly key: number
  ) {
    super()
  }

  public onData(chunk: Uint8Array) {
    // TODO: u32 optimize
    for (let i = 0; i < chunk.length; i++) {
      chunk[i] ^= this.key
    }
    return chunk
  }

  public onEnd(chunk: Uint8Array) {
    return this.onData(chunk)
  }
}
