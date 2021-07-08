namespace CacheManager {
  let mCache: Cache

  // TODO: LRU

  export async function init() {
    if (!mCache) {
      mCache = await caches.open('.freecdn')
    }
  }

  export async function findHash(hash: string) {
    const res = await findCache('/' + hash)
    if (!res) {
      return
    }
    const buf = await res.clone().arrayBuffer()
    const bin = new Uint8Array(buf)
    const hashGot = await sha256(bin)
    const hashExp = base64Decode(hash)
    if (!hashExp) {
      return
    }
    if (!isArrayEqual(hashGot, hashExp)) {
      console.warn('[FreeCDN/CacheManager] bad cache:', hash)
      delCache('/' + hash)
      return
    }
    return res
  }

  export async function addHash(hash: string, res: Response) {
    await addCache('/' + hash, res)
  }

  export function findCache(reqInfo: RequestInfo) {
    return mCache.match(reqInfo)
  }

  export async function addCache(reqInfo: RequestInfo, res: Response) {
    try {
      await mCache.put(reqInfo, res)
    } catch {
    }
  }

  export function delCache(reqInfo: RequestInfo) {
    return mCache.delete(reqInfo)
  }
}
