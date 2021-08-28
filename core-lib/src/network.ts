namespace Network {
  const enum Conf {
    NOT_FOUND_MAX_AGE = 300,
  }

  let mHostScoreMap: {[host: string]: number}
  let mDatabase: Database

  let mLastRecordNum = 0
  let mPreservePerformanceEntries = false


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

  function getHostScore(hostInfo: HostInfo, now: number) {
    // TODO: ...
    if (hostInfo.reqTimeAvg !== -1) {
      const delayScore = 100 - hostInfo.reqTimeAvg * 0.2
      return Math.max(delayScore, 10)
    }
    return 50
  }

  export function getUrlScore(url: string, now: number) {
    const urlInfo = mUrlInfoMap.get(url)
    if (urlInfo && urlInfo.expire < now) {
      if (urlInfo.status !== 200) {
        return -2
      }
      return 100 + urlInfo.expire
    }

    // current site
    if (url[0] === '/') {
      return -1
    }
    const host = getHostFromUrl(url)
    const hostInfo = mHostInfoMap.get(host)
    if (!hostInfo) {
      return mHostScoreMap[host] || 50
    }
    const hostScore = getHostScore(hostInfo, now)
    return hostScore
  }

  export function preservePerformanceEntries(v: boolean) {
    mPreservePerformanceEntries = v
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

    switch (res.status) {
    case 200:
      if (req.cache !== 'no-store') {
        const sec = parseMaxAge(res.headers, t0)
        if (sec > 60) {
          addUrlInfo(res.url, 200, t0 + sec)
        }
      }
      break
    case 404:
      addUrlInfo(res.url, 404, t0 + Conf.NOT_FOUND_MAX_AGE)
      break
    }
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
      // not strict
      if (cacheControl.includes('no-cache')) {
        return 0
      }
      const m = cacheControl.match(/(?:^|,\s*)max-age="?(\d+)"?/)
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
    return -1
  }


  function statistic() {
    const records = performance.getEntriesByType('resource')
    const currNum = records.length
    if (currNum === 0) {
      return
    }
    let begin = 0
    if (mPreservePerformanceEntries) {
      if (currNum === mLastRecordNum) {
        return
      }
      begin = mLastRecordNum
    }
    const timeBase = performance.timeOrigin

    for (let i = begin; i < currNum; i++) {
      const record = records[i] as PerformanceResourceTiming
      const host = getHostFromUrl(record.name)
      const info = getHostInfo(host)

      info.reqNum++
      info.lastDoneTime = timeBase + record.responseEnd

      // time-allow-origin
      if (record.responseStart > 0) {
        const reqTime = record.responseStart - record.requestStart
        info.reqTimeSum += reqTime
        info.reqTimeAvg = info.reqTimeSum / info.reqNum

        const readTime = record.responseEnd - record.responseStart
        const speed = record.encodedBodySize / readTime
      }
      // info.protocol = record.nextHopProtocol
    }

    if (mPreservePerformanceEntries) {
      mLastRecordNum = currNum
    } else {
      performance.clearResourceTimings()
    }
  }


  export async function init() {
    mHostScoreMap = ZONE_HOST_SCORE[navigator.language] || ZONE_HOST_SCORE['*']

    mDatabase = new Database('.freecdn')
    await mDatabase.open({
      'cache': {
        keyPath: 'url'
      },
    })

    const now = getTimeSec()

    await mDatabase.enum('cache', (item: UrlInfo) => {
      if (item.expire < now) {
        mDatabase.delete('cache', item.url)
        return
      }
      mUrlInfoMap.set(item.url, item)
    })

    performance.onresourcetimingbufferfull = (e) => {
      if (!mPreservePerformanceEntries) {
        statistic()
      }
    }
    statistic()
    setInterval(statistic, 2000)
  }
}
