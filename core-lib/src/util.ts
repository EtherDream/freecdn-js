const TEXT_ENCODER = new TextEncoder()
const TEXT_DECODER = new TextDecoder()

function utf8ToBytes(str: string) : Uint8Array {
  return TEXT_ENCODER.encode(str)
}

function bytesToUtf8(bytes: Uint8Array) : string {
  return TEXT_DECODER.decode(bytes)
}

function bytesToAsc(bytes: Uint8Array) : string {
  return bytes.reduce((s, v) => s + String.fromCharCode(v), '')
}

function base64Encode(bytes: Uint8Array) : string {
  return btoa(bytesToAsc(bytes))
}

function base64Decode(str: string) : Uint8Array | undefined {
  try {
    str = atob(str)
  } catch {
    return
  }
  const bin = new Uint8Array(str.length)
  for (let i = 0; i < bin.length; i++) {
    bin[i] = str.charCodeAt(i)
  }
  return bin
}

function parseJson(str: string) {
  try {
    return JSON.parse(str)
  } catch {
  }
}

function splitList(str: string) : string[] {
  str = str.trim()
  if (!str) {
    return []
  }
  return str.split(/\s+/)
}

function parseStrOrB64(str: string) : Uint8Array | undefined {
  // json string
  if (str[0] === '"') {
    str = parseJson(str)
    if (str === undefined) {
      return
    }
    return utf8ToBytes(str)
  }
  // base64
  return base64Decode(str)
}

const TIME_UNIT: {[key: string] : number} = {
  ''   : 1,
  'ms' : 1,
  's'  : 1000,
  'min': 1000 * 60,
  'h'  : 1000 * 3600,
  'd'  : 1000 * 3600 * 24,
  'y'  : 1000 * 3600 * 24 * 365,
}

function parseTime(str: string) : number {
  const m = str.match(/^([\d.]{1,9})(y|d|h|min|s|ms|)$/)
  if (!m) {
    return NaN
  }
  const [, num, unit] = m
  return +num * TIME_UNIT[unit]
}

function parseByteUnit(str: string) : number {
  const m = str.match(/^([\d.]{1,9})(k|K|M|G|)(i|)(b|B|)$/)
  if (!m) {
    return NaN
  }
  const [, num, kMG, i, bB] = m
  const power =
    kMG === 'k' ? 1 :
    kMG === 'K' ? 1 :
    kMG === 'M' ? 2 :
    kMG === 'G' ? 3 : 0

  const base = i ? 1024 : 1000
  const unit = bB === 'b' ? 8 : 1
  return +num * base ** power / unit
}

function getTimeSec() : number {
  return Date.now() / 1000 | 0
}

function concatBufs(bufs: Uint8Array[], size = 0) : Uint8Array {
  if (size === 0) {
    for (const v of bufs) {
      size += v.length
    }
  }
  const ret = new Uint8Array(size)
  let pos = 0
  for (const v of bufs) {
    ret.set(v, pos)
    pos += v.length
  }
  return ret
}


function isArrayEqual<T>(b1: ArrayLike<T>, b2: ArrayLike<T>) : boolean {
  if (b1.length !== b2.length) {
    return false
  }
  for (let i = 0; i < b1.length; i++) {
    if (b1[i] !== b2[i]) {
      return false
    }
  }
  return true
}


function getPair(str: string, delim: string) : [string, string?] {
  const pos = str.indexOf(delim)
  if (pos === -1) {
    return [str]
  }
  return [
    str.substr(0, pos),
    str.substr(pos + delim.length)
  ]
}

function mergeMap<K, V>(dst: Map<K, V>, src: Iterable<[K, V]>) : void {
  for (const [k, v] of src) {
    dst.set(k, v)
  }
}

/**
 * @param url absolute or relative url
 */
function stripUrlQuery(url: string) : string {
  const pos = url.indexOf('?')
  if (pos === -1) {
    return url
  }
  return url.substr(0, pos)
}

/**
 * @param url absolute url
 */
function getHostFromUrl(url: string) : string {
  const m = url.match(/^https?:\/\/([^/]+)/) as string[]
  return m[1]
}


const ROOT_PATH = location.origin + '/'
const MY_ORIGIN_LEN = location.origin.length

/**
 * @param url absolute or relative url
 */
function toRelUrl(url: string) : string {
  if (url.startsWith(ROOT_PATH)) {
    return url.substr(MY_ORIGIN_LEN)
  }
  return url
}

async function sha256(buf: Uint8Array) : Promise<Uint8Array> {
  const ret = await CRYPTO.digest('SHA-256', buf)
  return new Uint8Array(ret)
}
