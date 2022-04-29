///<reference path="../../core-lib/src/freecdn.ts"/>
///<reference path="../../core-lib/src/promisex.ts"/>
///<reference path="hook.ts"/>


declare const Q: any[]


namespace Sw {
  const GLOBAL: ServiceWorkerGlobalScope = self as any

  const mLoaderJsRes = new Response('/* freecdn is installed */', {
    headers: {
      'content-type': 'text/javascript',
      'cache-control': 'max-age=3600',
    },
  })

  let mFreeCDN: FreeCDN

  let mIniting: PromiseX | null
  let mResUrlMap: WeakMap<Response, string>


  // 共享模式（脚本通过业务方的 SW 引入）
  function sharedModeInit() {
    Hook.func(GLOBAL, 'fetch', oldFn => sharedModeHandler)

    Hook.func(Cache.prototype, 'add', oldFn => async function(req) {
      const res = await sharedModeHandler(req)
      await this.put(req, res)
    })

    Hook.func(Cache.prototype, 'addAll', oldFn => async function(reqs) {
      const tasks = reqs.map(req => this.add(req))
      await Promise.all(tasks)
    })

    mResUrlMap = new WeakMap()

    // 由于自定义的 Response 对象 url 为空，因此通过 hook 的方式保留原始 url
    Hook.prop(Response.prototype, 'url',
      getter => function() {
        return mResUrlMap.get(this) || getter.call(this)
      },
      /* setter */ null
    )

    Hook.func(Response.prototype, 'clone', oldFn => function() {
      const res = oldFn.call(this)
      const url = mResUrlMap.get(this)
      if (url) {
        mResUrlMap.set(res, url)
      }
      return res
    })
  }

  async function sharedModeHandler(input: RequestInfo, init?: RequestInit) {
    if (mIniting) {
      // freecdn 仍在初始化中（例如加载清单文件）
      await mIniting
    }
    const req = (input instanceof Request && !init)
      ? input
      : new Request(input, init)

    const res = await mFreeCDN.fetch(req)
    mResUrlMap.set(res, req.url)
    return res
  }

  // 独占模式（通过 freecdn-loader.min.js 引入）
  function loaderModeInit() {
    type tuple = Parameters<typeof loaderModeHandler>

    // 重写 Q.push，这样 loader-js 可直接传递 event 和 promise
    Q.push = loaderModeHandler as any

    while (Q.length) {
      const args = Q.splice(0, 3) as tuple
      loaderModeHandler(...args)
    }
  }

  function loaderModeHandler(
    e: FetchEvent,
    resolve: resolve_t<Response>,
    reject: reject_t,
  ) {
    const req = e.request

    // debug
    if (req.url.endsWith('/freecdn-update')) {
      mFreeCDN.update().then(result => {
        const res = new Response('updated. success: ' + result, {
          headers: {
            'content-type': 'text/html',
          },
        })
        resolve(res)
      })
      return
    }

    if (req.url === location.href) {
      resolve(mLoaderJsRes.clone())
      return
    }

    mFreeCDN.fetch(req).then(resolve, reject)
  }

  async function main() {
    mFreeCDN = new FreeCDN('freecdn-manifest.txt')

    const isSharedMode = !!(GLOBAL as any).FREECDN_SHARED_MODE

    let publicKey: string | undefined

    if (isSharedMode) {
      mFreeCDN.enableCacheStorage = false
      mIniting = promisex()

      // 在此之前不要使用 await，否则安装 hook 会被推迟，导致初始化时无法触发 hook
      sharedModeInit()
      publicKey = (GLOBAL as any).FREECDN_PUBLIC_KEY
    } else {
      publicKey = Q.shift()
    }

    if (publicKey) {
      await mFreeCDN.setPublicKey(publicKey)
    }
    await mFreeCDN.init()

    if (isSharedMode) {
      mIniting?.resolve()
      mIniting = null
    } else {
      loaderModeInit()
    }

    console.log('[FreeCDN] service worker inited')
  }
  main()
}