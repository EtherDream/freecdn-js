const enum ParamHashConf {
  MAX_QUEUE_LEN = 64 * 1024 * 1024
}

class ParamHash extends ParamBase {

  public static parseConf(conf: string) {
    // conf format:
    // [blksize;]hash1,hash2,...
    let blkLen = 1e9
    let hashes = conf

    const pos = conf.indexOf(';')
    if (pos > 0) {
      const blkLenStr = conf.substring(0, pos)
      hashes = conf.substring(pos + 1)
      blkLen = parseByteUnit(blkLenStr)
      if (isNaN(blkLen)) {
        return 'invalid block length'
      }
    }
    const hashBins: Uint8Array[] = []
    const hashB64s = hashes.split(',')

    // 倒序存储，之后 pop 取出
    for (let i = hashB64s.length - 1; i !== -1; i--) {
      const bin = base64Decode(hashB64s[i])
      if (!bin || bin.length !== LEN.SHA256_BIN) {
        return 'invalid block hash'
      }
      hashBins.push(bin)
    }
    return [blkLen, hashBins]
  }


  private readonly reader = new Reader()
  private hasData = false

  public constructor(
    private readonly blkLen: number,
    private readonly hashBins: Uint8Array[]
  ) {
    super()
  }

  public onData(chunk: Uint8Array) {
    this.hasData = true
    this.reader.feed(chunk)

    if (this.reader.availLen > LEN.MAX_QUEUE) {
      throw new ParamError('max queue length exceeded')
    }
    if (this.reader.availLen < this.blkLen) {
      return EMPTY_BUF
    }
    return this.pull(this.reader.availLen % this.blkLen)
  }

  public async onEnd(chunk: Uint8Array) {
    if (chunk.length > 0) {
      this.reader.feed(chunk)
    }
    if (this.reader.availLen === 0) {
      if (!this.hasData) {
        await this.verify(EMPTY_BUF)
      }
      return EMPTY_BUF
    }
    return this.pull(0)
  }

  private async pull(remain: number) {
    const blks = this.reader.readBytesSync(this.reader.availLen - remain)

    for (let p = 0; p < blks.length; p += this.blkLen) {
      const blk = blks.subarray(p, p + this.blkLen)
      await this.verify(blk)
    }
    return blks
  }

  private async verify(blk: Uint8Array) {
    const hashExp = this.hashBins.pop()
    if (!hashExp) {
      throw new ParamError('missing hash')
    }
    const hashGot = await sha256(blk)

    if (!isArrayEqual(hashExp, hashGot)) {
      const exp = base64Encode(hashExp)
      const got = base64Encode(hashGot)
      throw new ParamError(`hash incorrect. expected: ${exp}, but got: ${got}`)
    }
  }
}