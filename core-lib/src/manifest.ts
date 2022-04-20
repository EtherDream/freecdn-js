//
// 匹配清单中的文件块。例如：
//
// (http://foo/path/to/file)
//    ...
// (/path/to/file)
//    ...
// (@config)
//    ...
// 其中 $0 为文件名，内容部分只匹配不捕获，之后通过 lastIndex 截取
//
const REG_HEAD_LINE = /^(?:\/|https?:|@).*/mg


class Manifest {
  private readonly urlFileMap = new Map<string, FileConf>()
  public globalParams!: params_t


  public has(key: string) {
    return this.urlFileMap.has(key)
  }

  public get(key: string) {
    return this.urlFileMap.get(key)
  }

  public getParams(name: string) {
    const fileConf = this.get(name)
    if (fileConf) {
      fileConf.parse()
      return fileConf.params
    }
  }

  public async parse(txt: string) {
    this.parseFile(txt + DEFAULT_PARAMS)

    const inc = this.urlFileMap.get('@include')
    if (inc) {
      const cdn = new FreeCDN()
      cdn.manifest = this

      const urls = inc.getLines()
      const rets = urls.map(cdn.fetchText, cdn)
      const txts = await Promise.all(rets)
      txts.forEach(this.parseFile, this)
    }
  }

  private parseFile(txt: string) {
    // lazy parse
    let name = ''
    let last = 0

    for (;;) {
      const m = REG_HEAD_LINE.exec(txt)
      if (last > 0) {
        if (name[0] !== '@') {
          name = toRelUrl(name)
        }
        const curr = m ? m.index : txt.length
        const part = txt.substring(last, curr)
        const conf = new FileConf(name, part)

        this.urlFileMap.set(name, conf)
      }
      if (!m) {
        break
      }
      name = m[0]
      last = REG_HEAD_LINE.lastIndex
    }

    const m0 = this.getParams('@__default__') as params_t
    const m1 = this.getParams('@global')

    this.globalParams = m1 ? new Map([...m0, ...m1]) : m0
  }
}
