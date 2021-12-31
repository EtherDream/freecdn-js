declare const RELEASE: never
declare const MAIN_JS_HASH: string
declare const VER: string

declare const SW: ServiceWorkerGlobalScope
declare let onfetch: typeof SW.onfetch
declare let onactivate: typeof SW.onactivate
declare const clients: Clients

// global queue
declare let Q: any[]


(function() {
  const IS_DEBUG = typeof RELEASE === 'undefined'
  const globalEval = eval
  let flag: number


  function loadFailJs(err?: Error) {
    if (flag) {
      return
    }
    flag = 1

    const FAIL_JS = IS_DEBUG
      ? '/freecdn-internal/dev/fail.js'
      : `/freecdn-internal/${VER}/fail.min.js`

    const s = document.createElement('script')
    s['e'] = err
    document.documentElement.appendChild(s).src = FAIL_JS
  }

  function loadMainJs(url: string) {
    if (flag) {
      return
    }
    fetch(url, {integrity: MAIN_JS_HASH}).then(res => {
      return res.text().then(txt => {
        if (flag) {
          return
        }
        flag = 1
        globalEval(txt)
      })
    }).catch(err => {
      console.warn(err)
    })
  }

  if (self.document) {
    const sw = navigator.serviceWorker
    if (!sw || sw.controller || !self.BigInt /* ES2020 */) {
      loadFailJs()
    } else {
      setTimeout(loadFailJs, 3000)

      sw.register((document.currentScript as HTMLScriptElement).src)
        .catch(loadFailJs)

      sw.ready.then(() => {
        if (flag) {
          return
        }
        // timer will trigger if the page is still reloading
        flag = 1
        location.reload()
      })
    }
  } else {
    Q = ['PUBLIC_KEY_PLACEHOLDER']

    // event handlers must be added during
    // the worker script's initial evaluation
    onfetch = (e) => {
      e.respondWith(
        new Promise((resolve, reject) => {
          Q.push(e, resolve, reject)
        })
      )
    }
    onactivate = () => {
      clients.claim()
    }

    if (IS_DEBUG) {
      importScripts('freecdn-internal/dev/freecdn-main.js')
      return
    }

    try {
      globalEval('')

      const URL_CDNS = [
        `https://cdn.jsdelivr.net/npm/freecdn-js@${VER}/dist/freecdn-main.min.js`,
        `https://unpkg.com/freecdn-js@${VER}/dist/freecdn-main.min.js`,
      ]
      // trade bandwidth for time
      URL_CDNS.map(loadMainJs)

      // current site as a fallback
      setTimeout(loadMainJs, 1000, `freecdn-internal/${VER}/freecdn-main.min.js`)
    } catch {
      // eval is not allowed
      importScripts(`freecdn-internal/${VER}/freecdn-main.min.js`)
    }
  }
})()
