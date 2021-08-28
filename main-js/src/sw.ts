///<reference path="../../core-lib/src/freecdn.ts"/>
///<reference path="../../core-lib/src/promisex.ts"/>
///<reference path="hook.ts"/>


declare const FREECDN_SHARED_MODE: boolean
declare const FREECDN_PUBLIC_KEY: string
declare const Q: any[]


namespace Sw {
  const GLOBAL: ServiceWorkerGlobalScope = self as any

  const mPageJsRes = new Response('/* freecdn is installed */', {
    headers: {
      'content-type': 'text/javascript',
      'cache-control': 'max-age=3600',
    },
  })

  let mFreeCDN: FreeCDN

  let mIniting: PromiseX | null
  let mResUrlMap: WeakMap<Response, string>

  /**
   * imported by custom service worker
   */
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
      await mIniting
    }
    const req = (input instanceof Request && !init)
      ? input
      : new Request(input, init)

    const res = await mFreeCDN.fetch(req)
    mResUrlMap.set(res, req.url)
    return res
  }

  /**
   * imported by loader-js
   */
  function loaderModeInit() {
    type tuple = Parameters<typeof loaderModeHandler>
    const queue: any[] = Q

    // hook Q.push()
    queue.push = loaderModeHandler as any

    while (queue.length) {
      const args = queue.splice(0, 3) as tuple
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
      resolve(mPageJsRes.clone())
      return
    }

    mFreeCDN.fetch(req).then(resolve, reject)
  }

  async function main() {
    mFreeCDN = new FreeCDN('freecdn-manifest.txt')

    const isSharedMode: boolean = typeof FREECDN_SHARED_MODE !== 'undefined'
    let publicKey: string

    if (isSharedMode) {
      mFreeCDN.enableCacheStorage = false
      mFreeCDN.preservePerformanceEntries = true
      mIniting = promisex()

      // install hook as early as possible,
      // don't use await before this
      sharedModeInit()
      publicKey = FREECDN_PUBLIC_KEY
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