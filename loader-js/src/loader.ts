//
// 注意点：
//  该脚本同时运行于 页面环境 和 Service Worker 环境
//  语法需兼容低版本浏览器（虽然低版本浏览器不支持 SW，但也不能报错）
//  最终体积尽可能小（npm run build 时可显示 brotli 压缩后的体积）
//
declare const RELEASE: never
declare const MAIN_JS_HASH: string
declare const VER: string

declare const PUBLIC_KEY_PLACEHOLDER: string
declare const CDN_URLS_PLACEHOLDER: string[]
declare const DELAY_PLACEHOLDER: number

declare const SW: ServiceWorkerGlobalScope
declare let onfetch: typeof SW.onfetch
declare let onactivate: typeof SW.onactivate
declare const clients: Clients

// 全局队列
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
      ? 'freecdn-internal/dev/fail.js'
      : 'freecdn-internal/' + VER + '/fail.min.js'

    const s = document.createElement('script')
    s['e'] = err
    document.documentElement.appendChild(s).src = FAIL_JS
  }

  function loadMainJs(url: string) {
    if (flag) {
      return
    }
    fetch(url, {integrity: MAIN_JS_HASH}).then(res => {
      res.text().then(txt => {
        if (flag) {
          return
        }
        flag = 1
        globalEval(txt)
      })
    })
  }

  if (self.document) {
    // 页面环境
    const sw = navigator.serviceWorker
    if (!sw || sw.controller || !self.BigInt /* ES2020 */) {
      loadFailJs()
    } else {
      setTimeout(loadFailJs, 3000)

      sw.register((document.currentScript as HTMLScriptElement).src)
        .catch(loadFailJs)

      sw.ready.then(() => {
        // 页面刷新过程中，仍可能触发此回调
        if (flag) {
          return
        }
        flag = 1
        location.reload()
      })
    }
  } else {
    // Service Worker 环境
    Q = [PUBLIC_KEY_PLACEHOLDER]

    // 事件必须初始化时注册（不能异步注册）
    onfetch = (e) => {
      e.respondWith(
        new Promise((resolve, reject) => {
          // main-js 加载时，event 和 promise 暂存在 Q 中
          // main-js 运行后会重写 Q.push，相当于直接传递
          Q.push(e, resolve, reject)
        })
      )
    }

    onactivate = () => {
      // sw 运行后立即接管页面请求
      clients.claim()
    }

    // 调试模式（脚本通过 freecdn js --make --dev 创建）
    if (IS_DEBUG) {
      importScripts('freecdn-internal/dev/freecdn-main.js')
      return
    }

    try {
      // 如果 sw 的响应头存在 CSP，可能无法 eval
      globalEval('')

      // 同时从多个公共 CDN 加载 main-js，哪个先完成执行哪个，提高稳定性
      CDN_URLS_PLACEHOLDER.map(loadMainJs)

      // 如果公共 CDN 不可用，从当前站点加载 main-js
      setTimeout(loadMainJs, DELAY_PLACEHOLDER, 'freecdn-internal/' + VER + '/freecdn-main.min.js')
    } catch {
      // 无法 eval 的情况下，使用 importScripts 加载 main-js
      // 由于 importScripts 不支持 hash 校验，因此出于安全性，只从当前站点加载
      importScripts('freecdn-internal/' + VER + '/freecdn-main.min.js')
    }
  }
})()
