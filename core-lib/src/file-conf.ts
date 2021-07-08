// 匹配缩进开头的行，捕获 trim 后的内容（排除 `#` 注释行）
const REG_SUB_LINE = /^\s+([^#\s].+?)\s*$/mg


class FileConf {
  public urlConfs: readonly UrlConf[]
  public params: params_t


  public constructor(
    public readonly name: string,
    private text: string
  ) {
  }

  public getLines() {
    const lines: string[] = []
    for (;;) {
      const m = REG_SUB_LINE.exec(this.text)
      if (!m) {
        break
      }
      lines.push(m[1])
    }
    this.text = ''
    return lines
  }

  public parse() {
    if (this.text === '') {
      return
    }
    const urlConfs: UrlConf[] = []
    const params = new Map<string, string>()

    for (const line of this.getLines()) {
      if (/^https?:|^\//.test(line)) {
        const urlConf = new UrlConf(line, params)
        urlConfs.push(urlConf)
      } else {
        const [key, val] = getPair(line, '=')
        if (val === undefined) {
          console.warn('[FreeCDN/FileConf] missing param value:', line)
          continue
        }
        params.set(key, val)
      }
    }
    this.params = params
    this.urlConfs = urlConfs
  }
}
