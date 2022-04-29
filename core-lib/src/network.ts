namespace Network {
  const enum Conf {
    DEFAULT_MAX_AGE = 300,
  }

  const mDatabase = new Database('.freecdn')

  interface UrlInfo {
    url: string,
    status: number,
    expire: number,
  }
  const mUrlInfoMap = new Map<string, UrlInfo>()

  function addUrlInfo(url: string, status: number, expire: number) {
    if (mUrlInfoMap.has(url)) {
      return
    }
    const info: UrlInfo = {url, status, expire}
    mUrlInfoMap.set(url, info)

    mDatabase.put('cache', info)
  }


  class HostInfo {
    public lastDoneTime = 0
    public lastErrTime = 0

    public pending = 0
    // public protocol = 1

    public errNum = 0
    public reqNum = 0
    public reqTimeAvg = -1
    public reqTimeSum = 0
    // public speedAvg = 0
    // public speedSum = 0
  }
  const mHostInfoMap = new Map<string, HostInfo>()

  function getHostInfo(host: string) {
    let info = mHostInfoMap.get(host)
    if (!info) {
      info = new HostInfo()
      mHostInfoMap.set(host, info)
    }
    return info
  }

  function getHostWeight(hostInfo: HostInfo, now: number) {
    // TODO: ...
    if (hostInfo.reqTimeAvg !== -1) {
      const delayScore = 100 - hostInfo.reqTimeAvg * 0.2
      return Math.max(delayScore, 10)
    }
    return 50
  }

  export function getUrlWeight(url: string, now: number, hostWeightMap: Map<string, number>) {
    const urlInfo = mUrlInfoMap.get(url)
    if (urlInfo && urlInfo.expire < now) {
      if (urlInfo.status !== 200) {
        return -2
      }
      // 该 URL 之前加载过
      // expire 值越大，已过期的概率越小，权重越高
      return 100 + urlInfo.expire
    }

    // 当前站点默认权重 -1，低于免费站点，减少流量成本
    if (url[0] === '/') {
      return hostWeightMap.get(MY_HOST) ?? -1
    }
    const host = getHostFromUrl(url)
    const hostInfo = mHostInfoMap.get(host)
    if (!hostInfo) {
      return hostWeightMap.get(host) ?? 50
    }
    return getHostWeight(hostInfo, now)
  }

  export async function fetch(req: Request) {
    const host = getHostFromUrl(req.url)
    const hostInfo = getHostInfo(host)
    hostInfo.pending++

    const t0 = getTimeSec()

    let res: Response
    try {
      res = await NATIVE_FETCH(req)
    } catch (err: any) {
      parseFetchError(err, req, hostInfo, t0)
      throw err
    } finally {
      hostInfo.pending--
    }

    const maxAge = parseMaxAge(res.headers, t0)

    switch (res.status) {
    case 200:
      if (req.cache !== 'no-store') {
        if (maxAge > 60) {
          addUrlInfo(res.url, 200, t0 + maxAge)
        }
      }
      break
    case 404:
      addUrlInfo(res.url, 404, t0 + maxAge)
      break
    }

    // 过期时间会在 expires 参数中会用到，避免重复分析
    (res as any)._maxage = maxAge

    return res
  }

  const REG_NET_ERR = /^Failed to fetch|^NetworkError|^Could not connect/

  function parseFetchError(err: Error, req: Request, hostInfo: HostInfo, t0: number) {
    if (!navigator.onLine) {
      return
    }
    if (!REG_NET_ERR.test(err.message)) {
      return
    }
    if (req.cache === 'only-if-cached') {
      return
    }
    hostInfo.errNum++
    hostInfo.lastErrTime = t0
  }

  function parseMaxAge(headers: Headers, t0: number) {
    const cacheControl = headers.get('cache-control')
    if (cacheControl !== null) {
      if (cacheControl.includes('no-cache')) {
        return 0
      }
      const m = cacheControl.match(/max-age="?(\d+)"?/)
      if (m) {
        return +m[1]
      }
    }
    const expires = headers.get('expires')
    if (expires !== null) {
      const t1 = Date.parse(expires) / 1000
      if (t1) {
        return (t1 - t0) | 0
      }
    }
    return Conf.DEFAULT_MAX_AGE
  }


  function parseEntries(list: PerformanceEntryList) {
    const timeBase = performance.timeOrigin

    for (const record of list as PerformanceResourceTiming[]) {
      const host = getHostFromUrl(record.name)
      const info = getHostInfo(host)

      info.reqNum++
      info.lastDoneTime = timeBase + record.responseEnd

      // time-allow-origin
      if (record.responseStart > 0) {
        const reqTime = record.responseStart - record.requestStart
        info.reqTimeSum += reqTime
        info.reqTimeAvg = info.reqTimeSum / info.reqNum
      }
    }
  }


  export async function init() {
    await mDatabase.open({
      'cache': {
        keyPath: 'url'
      },
    })

    const now = getTimeSec()

    // 读取 URL 历史信息
    await mDatabase.enum('cache', (item: UrlInfo) => {
      if (item.expire < now) {
        mDatabase.delete('cache', item.url)
        return
      }
      mUrlInfoMap.set(item.url, item)
    })

    // 跟踪每个 URL 的性能指标
    const entries = performance.getEntriesByType('resource')
    parseEntries(entries)

    const observer = new PerformanceObserver(entryList => {
      const entries = entryList.getEntries()
      parseEntries(entries)
    })
    observer.observe({
      entryTypes: ['resource']
    })
  }


  export function parseWeightConf(manifest: Manifest) {
    const zone = navigator.language.toLowerCase()
    const zone0 = zone.split('-')[0]
    const weightParams =
      manifest.getParams('@weight ' + zone) ||
      manifest.getParams('@weight ' + zone0) ||
      manifest.getParams('@weight')

    if (!weightParams) {
      const obj = ZONE_HOST_SCORE[zone] || ZONE_HOST_SCORE['*']
      return new Map(Object.entries(obj))
    }

    const map = new Map<string, number>()
    for (const [k, v] of weightParams) {
      const num = +v
      if (isNaN(num)) {
        continue
      }
      map.set(k, num)
    }
    return map
  }
}
