declare const VER: string
declare const RELEASE: never
const IS_DEBUG = typeof RELEASE === 'undefined'


const DEFAULT_PARAMS = `
@__default__
 expires=30s
 mime=auto
 open_timeout=10s
 valid_status=200
`
const DEFAULT_MANIFEST_PATH = '/freecdn-manifest.txt'
const MY_URL = location.href
const MY_HOST = location.host
const MY_ORIGIN = location.origin
const ROOT_PATH = MY_ORIGIN + '/'

const INTERNAL_DIR = 'freecdn-internal/' + (IS_DEBUG ? 'dev' : VER)
const INTERNAL_PATH = new URL(INTERNAL_DIR, ROOT_PATH).pathname
const REG_IMG_EXTS = /\.(?:jpg|jpeg|png|apng|gif|ico|bmp)$/i

const enum LEN {
  SHA256_BIN = 32,
  SHA256_B64 = 44,
  PUBKEY_B64 = 124,
}

type params_t = ReadonlyMap<string, string>

const NATIVE_FETCH = fetch
const EMPTY_BUF = new Uint8Array(0)

const CRYPTO = crypto.subtle


let gInited: boolean | PromiseX

async function globalInit() {
  if (gInited) {
    return gInited
  }
  gInited = promisex()

  await CacheManager.init()
  await Network.init()
  UrlConf.init()

  gInited.resolve()
  gInited = true
}