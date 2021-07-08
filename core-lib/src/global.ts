declare const VER: string
declare const RELEASE: never
const IS_DEBUG = typeof RELEASE === 'undefined'


const DEFAULT_PARAMS = `
@__default__
 expires=30s
 mime=auto
 open_timeout=10s
`
const DEFAULT_MANIFEST_PATH = '/freecdn-manifest.txt'
const INTERNAL_PATH = 'freecdn-internal/' + (IS_DEBUG ? 'dev' : VER)
const REG_IMG_EXTS = /\.(?:jpg|jpeg|png|apng|gif|ico|bmp)$/i

const enum LEN {
  SHA256_BIN = 32,
  SHA256_B64 = 44,
  PUBKEY_B64 = 124,
}

type params_t = ReadonlyMap<string, string>

const NATIVE_FETCH = fetch
const EMPTY_BUF = new Uint8Array(0)

const MY_HOST = location.host
const CRYPTO = crypto.subtle