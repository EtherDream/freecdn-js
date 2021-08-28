class ParamValidStatus extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    if (conf === '*') {
      return
    }
    const codes = conf.split(',').map(Number)
    return [codes]
  }


  public constructor(
    private readonly codes: number[]
  ) {
    super()
  }

  public onResponse(resArgs: ResponseArgs, fileLoader: FileLoader, rawRes: Response) {
    if (!this.codes.includes(rawRes.status)) {
      throw new ParamError('invalid http status: ' + rawRes.status)
    }
  }
}
