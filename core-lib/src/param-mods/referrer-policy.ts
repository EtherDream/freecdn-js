const REG_REFFERER_POLICY = /^(?:no-referrer|unsafe-url|origin|same-origin|strict-origin|no-referrer-when-downgrade|origin-when-cross-origin|strict-origin-when-cross-origin)$/


class ParamReferrerPolicy extends ParamBase {
  public static reuse = true

  public static parseConf(conf: string) {
    if (conf === 'raw') {
      return ['']
    }
    if (!REG_REFFERER_POLICY.test(conf)) {
      return 'invalid value'
    }
    return [conf]
  }


  public constructor(
    private readonly policy: ReferrerPolicy
  ) {
    super()
  }

  public onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) {
    reqArgs.referrerPolicy = this.policy || fileLoader.rawReq.referrerPolicy
  }
}
