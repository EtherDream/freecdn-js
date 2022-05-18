declare const BR_GLUE_HASH: string
declare const BR_WASM_HASH: string

const enum ParamBrConf {
  WASM_LOAD_TIMEOUT = 1000 * 20,
  IN_BUF_LEN = 1024 * 128,
  OUT_BUF_LEN = 1024 * 512,
}

class ParamBr extends ParamBase {
  private static hasErr = false
  private static signal: PromiseX | undefined
  private static asmMod: any

  private static inPtr: number
  private static outPtr: number


  private static async init() {
    if (this.signal) {
      return
    }
    this.signal = promisex()

    const BR_WASM_PATH = `${INTERNAL_PATH}/br/br.wasm`
    const BR_GLUE_PATH = `${INTERNAL_PATH}/br/` + (IS_DEBUG ? 'br.js' : 'br.min.js')

    const BR_MANIFEST = IS_DEBUG ? '' : `
${BR_WASM_PATH}
	https://cdn.jsdelivr.net/npm/freecdn-js@${VER}/dist/br/br.wasm
	https://unpkg.com/freecdn-js@${VER}/dist/br/br.wasm
	https://code.bdstatic.com/npm/freecdn-js@${VER}/dist/br/br.wasm
	https://npm.elemecdn.com/freecdn-js@${VER}/dist/br/br.wasm
	hash=${BR_WASM_HASH}

${BR_GLUE_PATH}
	https://cdn.jsdelivr.net/npm/freecdn-js@${VER}/dist/br/br.min.js
	https://unpkg.com/freecdn-js@${VER}/dist/br/br.min.js
	https://code.bdstatic.com/npm/freecdn-js@${VER}/dist/br/br.min.js
	https://npm.elemecdn.com/freecdn-js@${VER}/dist/br/br.min.js
	hash=${BR_GLUE_HASH}
`
    const onError = () => {
      this.hasErr = true
      this.signal?.resolve()
    }
    const timer = setTimeout(onError, ParamBrConf.WASM_LOAD_TIMEOUT)

    const asmMod: any = {
      locateFile: () => BR_WASM_PATH,
      onRuntimeInitialized: () => {
        this.inPtr = asmMod._AllocInBuf(ParamBrConf.IN_BUF_LEN)
        this.outPtr = asmMod._AllocOutBuf(ParamBrConf.OUT_BUF_LEN)

        clearTimeout(timer)
        this.signal?.resolve()
        this.signal = undefined
      },
      onAbort: (reason: any) => {
        console.warn('[FreeCDN/Br] wasm onAbort:', reason)
        onError()
      },
      print: (msg: any) => {
        console.warn('[FreeCDN/Br] wasm print:', msg)
      },
      printErr: (err: any) => {
        console.warn('[FreeCDN/Br] wasm printErr:', err)
      },
    }

    const manifest = new Manifest()
    await manifest.parse(BR_MANIFEST)

    const cdn = new FreeCDN()
    cdn.manifest = manifest

    const onFetch: typeof cdn.fetch = async (...args) => {
      try {
        return await cdn.fetch(...args)
      } catch (err) {
        console.warn('[FreeCDN/Br] failed to load wasm')
        onError()
        throw err
      }
    }
    try {
      const js = await cdn.fetchText(BR_GLUE_PATH)
      const fn = Function('Module', 'fetch', js)
      fn(asmMod, onFetch)
    } catch {
      console.warn('[FreeCDN/Br] failed to execute glue js')
      onError()
      return
    }
    this.asmMod = asmMod
  }

  public static parseConf(conf: string) {
    if (conf === 'off') {
      return
    }
    if (conf === 'on') {
      if (!this.asmMod) {
        this.init()
      }
      return []
    }
    return 'invalid value'
  }


  private state = 0

  public constructor() {
    super()
  }

  public onResponse(resArgs: ResponseArgs) {
    resArgs.contentLen = -1
  }

  public async onData(chunk: Uint8Array) {
    if (ParamBr.signal) {
      await this.waitWasm()
    }
    return this.process(chunk)
  }

  public async onEnd(chunk: Uint8Array) {
    if (ParamBr.signal) {
      await this.waitWasm()
    }
    // ???
    let buf = EMPTY_BUF
    if (chunk.length > 0) {
      buf = this.process(chunk)
    }
    this.destory()
    return buf
  }

  private async waitWasm() {
    await ParamBr.signal
    if (ParamBr.hasErr) {
      throw new ParamError('failed to load br decoder')
    }
  }

  private process(chunk: Uint8Array) {
    // brotli/c/include/decode.h
    const enum RET {
      ERROR = 0,
      SUCCESS = 1,
      NEEDS_MORE_INPUT = 2,
      NEEDS_MORE_OUTPUT = 3
    }
    const asmObj = ParamBr.asmMod
    const HEAPU8 = asmObj.HEAPU8 as Uint8Array

    if (this.state === 0) {
      this.state = asmObj._Init()
    }

    const outBufs: Uint8Array[] = []

    for (let p = 0; p < chunk.length; p += ParamBrConf.IN_BUF_LEN) {
      const inBuf = chunk.subarray(p, p + ParamBrConf.IN_BUF_LEN)
      HEAPU8.set(inBuf, ParamBr.inPtr)

      let avaiablelIn = inBuf.length
      let availableOut = 0
      do {
        const ret = asmObj._Update(this.state, 0, avaiablelIn)

        if (ret === RET.ERROR) {
          const err = asmObj._GetErrorCode()
          this.destory()
          throw new ParamError('br decode failed. code: ' + err)
        }
        avaiablelIn = asmObj._GetAvailableIn()
        availableOut = asmObj._GetAvailableOut()

        const len = ParamBrConf.OUT_BUF_LEN - availableOut
        if (len === 0) {
          continue
        }
        // use slice (copy), not subarray (ref)
        const outBuf = HEAPU8.slice(ParamBr.outPtr, ParamBr.outPtr + len)
        outBufs.push(outBuf)
      } while (asmObj._HasMoreOutput(this.state))
    }

    if (outBufs.length === 1) {
      return outBufs[0]
    }
    return concatBufs(outBufs)
  }

  private destory() {
    ParamBr.asmMod._Destroy(this.state)
  }
}
