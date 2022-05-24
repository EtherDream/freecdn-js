///<reference path="global.ts"/>
///<reference path="param-base.ts"/>
///<reference path="key-manager.ts"/>
///<reference path="manifest.ts"/>
///<reference path="url-conf.ts"/>
///<reference path="url-loader.ts"/>
///<reference path="file-conf.ts"/>
///<reference path="file-loader.ts"/>
///<reference path="updater.ts"/>


class FreeCDN {
  public enableCacheStorage = true
  public manifest: Manifest | undefined
  public isSubReq = false

  private readonly updater: Updater | undefined
  public weightConf = new Map<string, number>()
  private inited = false


  public constructor(manifestUrl?: string) {
    if (!manifestUrl) {
      return
    }
    const updater = new Updater(manifestUrl, manifest => {
      this.manifest = manifest

      const updateConf = manifest.getParams('@update') || EMPTY_PARAMS
      updater.applyConfs(updateConf)

      // 权重参数
      this.weightConf = Network.parseWeightConf(manifest)
    })

    this.updater = updater
  }

  public async fetch(input: RequestInfo, init?: RequestInit) {
    const req = (input instanceof Request && !init)
      ? input
      : new Request(input, init)

    if (!/^https?:/.test(req.url)) {
      return NATIVE_FETCH(req)
    }

    const {manifest} = this
    if (!manifest) {
      return Network.fetch(req)
    }

    let fileConf: FileConf | undefined
    let suffix = ''

    FIND: for (;;) {
      const urlObj = new URL(req.url)

      // 同源 URL 使用相对路径，不同源使用完整路径（和清单中格式保持一致）
      const originPrefix = urlObj.origin === MY_ORIGIN ? '' : urlObj.origin

      // 带参数的 URL 尝试完整匹配
      if (urlObj.search) {
        fileConf = manifest.get(originPrefix + urlObj.pathname + urlObj.search)
        if (fileConf) {
          break
        }
      }

      // 合并路径中连续的 `/`
      const path = urlObj.pathname.replace(/\/{2,}/g, '/')
      const file = originPrefix + path

      // 优先使用 avif、webp 版本
      if (REG_IMG_EXTS.test(file) && req.mode !== 'cors' && !req.integrity) {
        const accept = req.headers.get('accept') || ''
        if (accept.includes('image/avif')) {
          fileConf = manifest.get(file + '.avif')
          if (fileConf) {
            break
          }
        }
        if (accept.includes('image/webp')) {
          fileConf = manifest.get(file + '.webp')
          if (fileConf) {
            break
          }
        }
      }

      fileConf = manifest.get(file)
      if (fileConf) {
        break
      }
      if (file.endsWith('/')) {
        fileConf = manifest.get(file + 'index.html')
        if (fileConf) {
          break
        }
      }
      // 重定向到 `/` 结尾的路径
      if (manifest.has(file + '/index.html')) {
        return Response.redirect(file + '/')
      }

      // 目录匹配
      // 尾部保存到 suffix 变量。例如访问 /path/to/file?a=1
      // 清单若存在 /path/ 文件，suffix 则为 `to/file?a=1`

      // 删除末尾的文件名。保持 `/` 结尾
      let dir = path.replace(/[^/]*$/, '')

      for (;;) {
        fileConf = manifest.get(originPrefix + dir)
        if (fileConf) {
          suffix = path.substring(dir.length) + urlObj.search
          break FIND
        }
        if (dir === '/') {
          break
        }
        // 删除末尾的目录名。保持 `/` 结尾
        dir = dir.replace(/[^/]+\/$/, '')
      }

      // 清单中无匹配，直接转发
      return Network.fetch(req)
    }

    fileConf.parse()

    let fileHash = ''
    const hashParam = fileConf.params.get('hash')
    if (hashParam && hashParam.length === LEN.SHA256_B64) {
      fileHash = hashParam
    }

    const range = req.headers.get('range')

    const cacheable = this.enableCacheStorage && fileHash && !range
    if (cacheable) {
      const res = await CacheManager.findHash(fileHash)
      if (res) {
        return res
      }
    }

    const fileLoader = new FileLoader(fileConf, req, this, range, suffix)
    const promiseObj = promisex<Response>()

    req.signal.addEventListener('abort', () => {
      const reason = (req.signal as any).reason || 'unknown'
      fileLoader.abort(reason)
    })

    // 如果文件只有一个 hash 则不用流模式（必须完整下载才能校验 hash）
    if (fileHash) {
      let resArgs: ResponseArgs
      let resBody: Uint8Array | undefined

      fileLoader.onOpen = (args) => {
        resArgs = args
      }
      fileLoader.onData = (body) => {
        resBody = body
      }
      fileLoader.onEnd = () => {
        const body = resBody || EMPTY_BUF
        const res = new Response(body, resArgs)

        if (cacheable && body.length < 1024 * 1024 * 5) {
          const cacheRes = res.clone()
          // 字段可在控制台列表中显示，方便调试
          cacheRes.headers.set('content-length', body.length + '')
          cacheRes.headers.set('x-raw-url', req.url)
          CacheManager.addHash(fileHash, cacheRes)
        }
        promiseObj.resolve(res)
      }
      fileLoader.onError = (err) => {
        console.warn('[FreeCDN]', err.message, err.urlErrs)
        promiseObj.reject(err)
      }
      fileLoader.open()
      return promiseObj
    }

    // 如果文件有多个 hash 或没有 hash，可使用流模式
    let controller: ReadableStreamDefaultController<Uint8Array>

    const checkPressure = () => {
      const {desiredSize} = controller
      if (desiredSize === null) {
        console.warn('desiredSize is null')
        return
      }
      if (desiredSize <= 0) {
        fileLoader.pause()
      } else {
        fileLoader.resume()
      }
    }

    const stream = new ReadableStream({
      start(c) {
        controller = c
      },
      pull: checkPressure,
      cancel(reason: any) {
        console.warn('[FreeCDN] stream cancel:', reason)
        fileLoader.abort(reason)
      },
    })

    fileLoader.onData = (chunk) => {
      controller.enqueue(chunk)
      checkPressure()
    }
    fileLoader.onEnd = () => {
      controller.close()
    }
    fileLoader.onError = (err) => {
      controller.error(err)
      console.warn('[FreeCDN]', err.message, err.urlErrs)
      promiseObj.reject(err)
    }
    fileLoader.onOpen = (args) => {
      const res = new Response(stream, args)
      promiseObj.resolve(res)
    }
    fileLoader.open()
    return promiseObj
  }

  public async fetchText(url: string) {
    const res = await this.fetch(url)
    return res.text()
  }

  public async fetchBin(url: string) {
    const res = await this.fetch(url)
    const buf = await res.arrayBuffer()
    return new Uint8Array(buf)
  }

  public async fetchBlob(url: string) {
    const res = await this.fetch(url)
    const buf = await res.arrayBuffer()
    const type = res.headers.get('content-type') || ''
    return new Blob([buf], {type})
  }

  public async update() {
    if (this.updater) {
      return this.updater.update()
    }
    return false
  }

  public async setPublicKey(keyB64: string) {
    if (keyB64.length !== LEN.PUBKEY_B64) {
      keyB64 = `MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE${keyB64}==`
    }
    await KeyManager.set(keyB64)
  }

  public async init() {
    console.assert(!this.inited)
    this.inited = true

    await globalInit()

    if (this.updater) {
      await this.updater.init()
    }
  }
}