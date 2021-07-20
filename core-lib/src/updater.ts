const enum UpdaterConf {
  FETCH_TIMEOUT = 1000 * 3,

  DEFAULT_INTERVAL = 1000 * 300,
  MIN_INTERVAL = 1000,

  SET_SVC_DELAY = 1000 * 5,
  WS_RETRY_DELAY = 1000 * 20,
}

const EMPTY_PARAMS: params_t = new Map()


class Updater {
  private readonly manifestUrl: string
  private readonly urlWsMap = new Map<string, WebSocket>()
  private readonly wsArgs: string = ''

  private updating = false
  private manifestHash = EMPTY_BUF
  private pollingTimer = 0
  private pollingInterval = UpdaterConf.DEFAULT_INTERVAL
  private lastTime = 0
  private setSvcTimer = 0
  private backupUrls: string[] = []


  public constructor(
    private readonly freecdn: FreeCDN,
    manifestPath: string,
  ) {
    const url = new URL(manifestPath, location.href)
    console.assert(url.host === MY_HOST)

    const path = url.pathname + url.search
    if (path !== DEFAULT_MANIFEST_PATH) {
      this.wsArgs = '?manifest=' + encodeURIComponent(path)
    }
    this.manifestUrl = path
  }

  private async getManifestFromCache() {
    const res = await CacheManager.findCache(this.manifestUrl)
    if (!res) {
      return
    }
    const buf = await res.arrayBuffer()
    const bin = new Uint8Array(buf)
    if (!await KeyManager.verify(bin)) {
      return
    }
    const txt = bytesToUtf8(bin)
    const manifest = new Manifest()
    await manifest.parse(txt)
    return manifest
  }

  public async init() {
    const manifest = await this.getManifestFromCache()
    if (!manifest) {
      await this.update()
      return
    }
    const params = manifest.getParams('@update')
    if (params) {
      this.parseBackupParam(params)
    }
    if (!await this.update()) {
      console.warn('[FreeCDN/Updater] use cached manifest')
      this.freecdn.manifest = manifest
      this.applyConfs(manifest)
    }
  }

  public async update() {
    if (this.updating) {
      return true
    }
    const now = Date.now()
    if (now - this.lastTime < UpdaterConf.MIN_INTERVAL) {
      return true
    }
    this.lastTime = now
    this.updating = true
    try {
      return await this.updateUnsafe()
    } catch (err) {
      console.error('[FreeCDN/Updater] update err:', err)
      return false
    } finally {
      this.updating = false
    }
  }

  private async updateUnsafe() {
    // from current site
    const data = await this.fetchManifest(this.manifestUrl)
    if (data) {
      await this.applyManifest(data)
      return true
    }
    console.warn('[FreeCDN/Updater] failed to fetch 1st manifest:', this.manifestUrl)

    if (this.backupUrls.length === 0) {
      console.warn('[FreeCDN/Updater] no backup url')
      return false
    }

    // from backup sites
    for (const url of this.backupUrls) {
      const data = await this.fetchManifest(url)
      if (!data) {
        console.warn('[FreeCDN/Updater] failed to fetch 3rd manifest:', url)
        continue
      }
      if (!await KeyManager.verify(data)) {
        console.warn('[FreeCDN/Updater] failed to verify 3rd manifest:', url)
        continue
      }
      await this.applyManifest(data)
      return true
    }
    console.warn('[FreeCDN/Updater] failed to reload')
    return false
  }

  private async fetchManifest(url: string) {
    const ctl = new AbortController()
    const tid = setTimeout(() => {
      ctl.abort()
    }, UpdaterConf.FETCH_TIMEOUT)

    const req = new Request(url, {
      // https://developer.mozilla.org/en-US/docs/Web/API/Request/cache
      cache: 'no-cache',
      signal: ctl.signal,
    })
    try {
      const res = await Network.fetch(req)
      const bin = await res.arrayBuffer()
      return new Uint8Array(bin)
    } catch {
    } finally {
      clearTimeout(tid)
    }
  }

  private async applyManifest(bytes: Uint8Array) {
    const hash = await sha256(bytes)
    if (isArrayEqual(this.manifestHash, hash)) {
      return
    }
    this.manifestHash = hash

    // save manifest to cache
    const res = new Response(bytes)
    CacheManager.addCache(this.manifestUrl, res)

    const manifest = new Manifest()
    const txt = bytesToUtf8(bytes)

    await manifest.parse(txt)
    this.freecdn.manifest = manifest

    this.applyConfs(manifest)
  }

  private applyConfs(manifest: Manifest) {
    this.applyUpdateParams(manifest.getParams('@update') || EMPTY_PARAMS)
    // ...
  }

  private applyUpdateParams(params: params_t) {
    this.backupUrls = this.parseBackupParam(params)

    const interval = this.parseIntervalParam(params)
    this.setPollingInterval(interval)

    const svcUrls = this.parseServicesParam(params)
    if (this.setSvcTimer > 0) {
      clearTimeout(this.setSvcTimer)
    }
    // 延时开启，减少对业务的性能影响
    this.setSvcTimer = setTimeout(() => {
      this.setSvcTimer = 0
      this.setServices(svcUrls)
    }, UpdaterConf.SET_SVC_DELAY)
  }

  private parseBackupParam(params: params_t) {
    const str = params.get('backup') || ''
    return splitList(str)
  }

  private parseIntervalParam(params: params_t) {
    const str = params.get('interval')
    if (str) {
      const num = parseTime(str)
      if (!isNaN(num)) {
        return num
      }
      console.warn('[FreeCDN/Updater] invalid interval:', str)
    }
    return UpdaterConf.DEFAULT_INTERVAL
  }

  private parseServicesParam(params: params_t) {
    const str = params.get('services') || ''
    return splitList(str)
  }

  private setPollingInterval(interval: number) {
    if (this.pollingInterval === interval) {
      return
    }
    this.pollingInterval === interval

    if (this.pollingTimer) {
      clearInterval(this.pollingTimer)
    }
    if (interval > 0) {
      this.pollingTimer = setInterval(() => {
        this.update()
      }, interval)
    }
  }

  private setServices(urls: string[]) {
    for (const [url, ws] of this.urlWsMap) {
      if (!urls.includes(url)) {
        ws.onclose = null
        ws.close()
        this.urlWsMap.delete(url)
      }
    }
    for (const url of urls) {
      if (!this.urlWsMap.has(url)) {
        this.createSvc(url)
      }
    }
  }

  private createSvc(url: string) {
    const ws = new WebSocket(url + this.wsArgs)
    ws.binaryType = 'arraybuffer'
    ws.onmessage = (e) => {
      const hashBin = new Uint8Array(e.data)
      if (isArrayEqual(this.manifestHash, hashBin)) {
        return
      }
      this.update()
    }
    ws.onclose = () => {
      this.urlWsMap.delete(url)

      setTimeout(() => {
        this.createSvc(url)
      }, UpdaterConf.WS_RETRY_DELAY)
    }
    this.urlWsMap.set(url, ws)
  }
}