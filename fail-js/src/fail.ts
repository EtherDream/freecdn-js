const enum Conf {
  INSTALL_TIMEOUT = 10,
  COOKIE_MAX_AGE = 600,
}
let mBootPage = false


function setFatalCookie() {
  const date = new Date(+new Date() + Conf.COOKIE_MAX_AGE * 1000)
  document.cookie = 'freecdn=0; path=/; expires=' + date.toUTCString()
}

function hasFatalCookie() {
  return document.cookie.indexOf('freecdn=0') !== -1
}

function hasFatalQuery() {
  return location.href.indexOf('freecdn__=0') !== -1
}

function fatal(msg: string) {
  if (self.console && console.log)  {
    console.log('[FreeCDN/fail]', msg)
  }
  setFatalCookie()

  if (mBootPage) {
    if (hasFatalCookie()) {
      location.reload()
    } else {
      // cookies are disabled
      const sign = /\?/.test(location.href) ? '&' : '?'
      location.href += sign + 'freecdn__=0'
    }
  }
}

function installed() {
  if (mBootPage) {
    location.reload()
  }
}

function main() {
  // https://github.com/EtherDream/freecdn/blob/master/examples/nginx/freecdn-boot.conf
  const el = document.getElementsByTagName('noscript')[0]
  if (el && el.innerHTML.indexOf('/freecdn-nojs') > 0) {
    mBootPage = true
  }

  if (hasFatalCookie() || hasFatalQuery()) {
    if (mBootPage) {
      document.write('server error')
    }
    return
  }

  if (!self.BigInt) {
    return fatal('browser is too old')
  }

  const sw = navigator.serviceWorker
  if (!sw) {
    return fatal('service worker is disabled')
  }

  const lastErr: Error = document.currentScript['e']
  if (lastErr) {
    return fatal('install error: ' + lastErr.message)
  }

  let num = 0
  const tid = setInterval(() => {
    if (++num === Conf.INSTALL_TIMEOUT) {
      clearInterval(tid)
      fatal('install timeout')
    }
    if (sw.controller) {
      clearInterval(tid)

      const swUrl = sw.controller.scriptURL
      if (swUrl.includes('freecdn-loader')) {
        installed()
      } else {
        fatal('service worker is existed: ' + swUrl)
      }
    }
  }, 1000)
}
main()