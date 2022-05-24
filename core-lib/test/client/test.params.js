'use strict'

describe('params', () => {
  const freecdn = new FreeCDN('manifest-params.conf')
  freecdn.enableCacheStorage = false

  before(async() => {
    await freecdn.init()
  })

  describe('mime', () => {
    it('known ext', async () => {
      const req = new Request('/mime.txt')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/plain'})
    })

    it('unknown ext', async () => {
      const req = new Request('/mime.unknown')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/plain'})
    })

    it('no ext', async () => {
      const req = new Request('/mime-no-ext')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'application/octet-stream'})
    })

    it('custom mime', async () => {
      const req = new Request('/mime-custom.txt')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/html'})
    })
  })


  describe('expires', () => {
    it('cache 0s', async () => {
      const req = new Request('/expires-0s')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'cache-control': 'max-age=0'})
    })

    it('cache 90s', async () => {
      const req = new Request('/expires-90s')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'cache-control': 'max-age=90'})
    })

    // 过期时间小于实际值，应使用实际值
    it('cache 10s', async () => {
      const req = new Request('/expires-10s')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'cache-control': 'max-age=10'})
    })
  })


  describe('headers', () => {
    it('discard headers', async () => {
      const req = new Request('/discard-res-headers')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include.keys('cache-control', 'content-type')
        .not.include.keys('x-req-1', 'x-req2')
    })

    it('add headers', async () => {
      const req = new Request('/add-res-headers')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'x-res1': 'foo', 'x-res2': 'bar'})
        .not.include.keys('X-Powered-By')
    })

    it('preserve headers', async () => {
      const req = new Request('/preserve-res-headers')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'x-via': 'XCDN', 'x-age': '100'})
    })

    it('preserve all headers', async () => {
      const req = new Request('/preserve-res-all-headers')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'x-via': 'XCDN', 'x-age': '100'})
    })

    it('overwrite headers', async () => {
      const req = new Request('/overwrite-res-headers')
      const res = await freecdn.fetch(req)
      expect(Object.fromEntries(res.headers))
        .include({'x-via': 'XCDN', 'x-age': '0'})
    })
  })


  describe('req_headers', () => {
    const CUSTOM_HEADERS = {
      'x-custom1': 'v1',
      'x-custom2': 'v2',
    }

    it('discard headers', async () => {
      const req = new Request('/discard-req-headers', {
        headers: CUSTOM_HEADERS
      })
      const res = await freecdn.fetch(req)
      expect(await res.json())
        .include.keys('host', 'user-agent', 'accept')
        .not.include.keys('x-custom1', 'x-custom2')
    })

    it('add headers', async () => {
      const res = await freecdn.fetch('/add-req-headers')
      expect(await res.json())
        .include({'x-req1': 'foo', 'x-req2': 'bar'})
        .not.include.keys('x-custom1', 'x-custom2')
    })

    it('preserve headers', async () => {
      const req = new Request('/preserve-req-headers', {
        headers: CUSTOM_HEADERS
      })
      const res = await freecdn.fetch(req)
      expect(await res.json())
        .include({'x-custom1': 'v1', 'x-custom2': 'v2'})
    })

    it('preserve all headers', async () => {
      const req = new Request('/preserve-req-all-headers', {
        headers: CUSTOM_HEADERS
      })
      const res = await freecdn.fetch(req)
      expect(await res.json())
        .include({'x-custom1': 'v1', 'x-custom2': 'v2'})
    })

    it('overwrite header', async () => {
      const req = new Request('/overwrite-req-headers', {
        headers: CUSTOM_HEADERS
      })
      const res = await freecdn.fetch(req)
      expect(await res.json())
        .include({'x-custom1': 'v1', 'x-custom2': 'xyz'})
    })

    it('spoof referrer', async () => {
      const res = await freecdn.fetch('/set-req-referer')
      expect(await res.json())
        .include({'referer': location.origin + '/foo/bar?a=1&b=2'})
    })
  })


  describe('valid_status', () => {
    it('multi', async () => {
      const txt = await freecdn.fetchText('/valid-status-multi')
      expect(txt).eq('211')
    })

    it('any', async () => {
      const txt = await freecdn.fetchText('/valid-status-any')
      expect(txt).eq('220')
    })
  })


  describe('referrer_policy', () => {
    it('full', async () => {
      const res = await freecdn.fetch('/referrer-full')
      expect(await res.json())
        .include({referer: location.href.split('#')[0]})
    })

    it('origin', async () => {
      const res = await freecdn.fetch('/referrer-origin')
      expect(await res.json())
        .include({referer: location.origin + '/'})
    })

    it('no', async () => {
      const res = await freecdn.fetch('/referrer-no')
      expect(await res.json())
        .not.include.keys('referer')
    })

    describe('raw', () => {
      it('unsafe-url', async () => {
        referrerMeta.content = 'unsafe-url'
        const res = await freecdn.fetch('/referrer-raw')
        expect(await res.json())
          .include({referer: location.href.split('#')[0]})
      })

      it('origin', async () => {
        referrerMeta.content = 'origin'
        const res = await freecdn.fetch('/referrer-raw')
        expect(await res.json())
          .include({referer: location.origin + '/'})
      })

      it('no-referrer', async () => {
        referrerMeta.content = 'no-referrer'
        const res = await freecdn.fetch('/referrer-raw')
        expect(await res.json())
          .not.include.keys('referer')
      })

      after(() => {
        referrerMeta.content = 'default'
      })
    })
  })


  describe('br', () => {
    it('small-file', async () => {
      const txt = await freecdn.fetchText('/br-small.js')
      expect(txt).eq('Hello World')
    })

    it('big-file', async () => {
      const txt = await freecdn.fetchText('/br-big.js')
      expect(txt).length(177366)
    })

    it('fallback', async () => {
      const txt = await freecdn.fetchText('/assets/angular.min.js')
      expect(txt).length(177366)
    })
  })


  describe('pos', () => {
    it('basic', async () => {
      const res = await freecdn.fetch('/file-right')
      const txt = await res.text()
      expect(txt).eq('World')
      expect(Object.fromEntries(res.headers))
        .include({'content-length': '5'})
    })

    it('out of range', async () => {
      const res = await freecdn.fetch('/pos-out-of-range')
      const txt = await res.text()
      expect(txt).eq('')
      expect(Object.fromEntries(res.headers))
        .include({'content-length': '0'})
    })
  })


  describe('size', () => {
    it('basic', async () => {
      const res = await freecdn.fetch('/file-left')
      const txt = await res.text()
      expect(txt).eq('Hello')
      expect(Object.fromEntries(res.headers))
        .include({'content-length': '5'})
    })
  })


  describe('prefix', () => {
    it('str', async () => {
      const DATA = '-----\tbegin\t-----\nHello World'
      const res = await freecdn.fetch('/prefix-str')
      const txt = await res.text()
      expect(txt).eq(DATA)
      expect(Object.fromEntries(res.headers))
        .include({'content-length': DATA.length + ''})
    })

    it('bin', async () => {
      const DATA = '你好😁Hello World'
      const res = await freecdn.fetch('/prefix-bin')
      const txt = await res.text()
      expect(txt).eq(DATA)
      expect(Object.fromEntries(res.headers))
        .include({'content-length': strToBytes(DATA).length + ''})
    })
  })


  describe('suffix', () => {
    it('str', async () => {
      const DATA = 'Hello World\n-----\tend\t-----'
      const res = await freecdn.fetch('/suffix-str')
      const txt = await res.text()
      expect(txt).eq(DATA)
      expect(Object.fromEntries(res.headers))
        .include({'content-length': DATA.length + ''})
    })

    it('bin', async () => {
      const DATA = 'Hello World\u0000\u0001\u0002\u0003\u0004'
      const res = await freecdn.fetch('/suffix-bin')
      const txt = await res.text()
      expect(txt).eq(DATA)
      expect(Object.fromEntries(res.headers))
        .include({'content-length': DATA.length + ''})
    })
  })


  describe('data', () => {
    it('str', async () => {
      const txt = await freecdn.fetchText('/data-str.js')
      expect(txt).eq('console.log("1")')
    })

    it('bin', async () => {
      const bin = await freecdn.fetchBin('/data-bin.gif')
      const b64 = base64Encode(bin)
      expect(b64).eq('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRA==')
    })

    it('mix', async () => {
      const txt = await freecdn.fetchText('/data-mix.html')
      expect(txt).eq('<h1>hello</h1>')
    })
  })


  describe('xor', () => {
    it('basic', async () => {
      const txt = await freecdn.fetchText('/hello-xor')
      expect(txt).eq('HelloWorld')
    })
  })


  describe('stream', () => {
    async function getChunkNum(url) {
      const res = await freecdn.fetch(url)
      const reader = res.body.getReader()
      let i = 0
      for (;;) {
        const ret = await reader.read()
        if (ret.done) {
          break
        }
        i++
      }
      return i
    }

    it('on', async () => {
      const n = await getChunkNum('/stream-on')
      expect(n).not.eq(1)
    })

    it('off', async () => {
      const n = await getChunkNum('/stream-off')
      expect(n).eq(1)
    })
  })


  describe('hash', () => {
    it('mini-file-correct', async () => {
      const txt = await freecdn.fetchText('/hash-mini-file-correct')
      expect(txt).eq('Hello World')
    })

    it('mini-file-incorrect', async () => {
      let hasError = false
      try {
        await freecdn.fetchText('/hash-mini-file-incorrect')
      } catch (err) {
        hasError = true
      }
      expect(hasError).true
    })

    it('big-file-correct', async () => {
      const bin = await freecdn.fetchBin('/hash-big-file-correct')
      const exp = randBytes(102400, 1)
      expect(bin).deep.eq(exp)
    })

    it('big-file-incorrect', async () => {
      let hasError = false
      try {
        await freecdn.fetchText('/hash-big-file-incorrect')
      } catch (err) {
        hasError = true
      }
      expect(hasError).true
    })

    it('multi-blocks-correct', async () => {
      const bin = await freecdn.fetchBin('/hash-multi-blocks-correct')
      expect(bin).length(102400)
    })

    it('multi-blocks-incorrect', async () => {
      const res = await freecdn.fetch('/hash-multi-blocks-incorrect')
      const reader = res.body.getReader()
      let hasError = false
      let bytesLen = 0
      for (;;) {
        try {
          const {value} = await reader.read()
          if (value) {
            bytesLen += value.length
          } else {
            break
          }
        } catch (err) {
          hasError = true
          break
        }
      }
      expect(hasError).true
      expect(bytesLen).eq(50000 * 2)
    })

    it('empty-data', async () => {
      const bin = await freecdn.fetchBin('/hash-empty')
      expect(bin).length(0)
    })
  })


  describe('bundle', () => {
    it('basic', async () => {
      for (let i = 0; i < 3; i++) {
        const [html, css, js] = await Promise.all([
          freecdn.fetchText('/bundle-test-1/index.html'),
          freecdn.fetchText('/bundle-test-1/assets/css/main.css'),
          freecdn.fetchText('/bundle-test-1/assets/js/main.js'),
        ])
        expect(html).include('<h1>Hello World</h1>')
        expect(css).include('font-family: monospace;')
        expect(js).include('console.log(123)')

        // test cache
        await sleep(i * 100)
      }
    })

    it('root index', async () => {
      const res = await freecdn.fetch('/bundle-test-1/')
      const txt = await res.text()
      expect(txt).include('<h1>Hello World</h1>')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/html'})
    })

    it('sub index', async () => {
      const res = await freecdn.fetch('/bundle-test-1/assets/pages/')
      const txt = await res.text()
      expect(txt).include('<h1>sub page</h1>')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/html'})
    })

    it('redir to sub page', async () => {
      const res = await freecdn.fetch('/bundle-test-1/assets/pages')
      const txt = await res.text()
      expect(txt).include('<script>location.pathname')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/html'})
    })

    it('fallback', async () => {
      const html = await freecdn.fetchText('/bundle/index.html')
      expect(html).include('<h1>Hello World</h1>')
    })

    it('custom headers', async () => {
      const res = await freecdn.fetch('/bundle-test-2/index.html')
      expect(Object.fromEntries(res.headers))
        .include({'x-custom': 'hello'})
    })
  })


  describe('concat', () => {
    it('basic', async () => {
      const txt = await freecdn.fetchText('/concat-hello')
      expect(txt).eq('Hello World' + 'hello2')
    })

    it('mix', async () => {
      const txt = await freecdn.fetchText('/concat-mix')
      expect(txt).eq('Hello World' + 'console.log("1")')
    })

    it('wildcard', async () => {
      const txt = await freecdn.fetchText('/concat-wc')
      expect(txt).eq('Hello World' +
        'A'.repeat(10000) +
        'B'.repeat(10000) +
        'C'.repeat(10000)
      )
    })

    it('range', async () => {
      performance.clearResourceTimings()
      const res = await freecdn.fetch('/concat-range', {
        headers: {
          range: 'bytes=10001-20001'
        }
      })
      // 不应该访问第一个切片文件
      const arr = performance.getEntriesByName('http://127.0.0.1:10003/api/delay-write?delay=1&count=10&data=A&size=1000')

      const txt = await res.text()
      expect(txt).eq('B'.repeat(10000 - 1) + 'C')
      expect(arr.length).eq(0)
    })
  })


  describe('open_timeout', () => {
    it('basic', async () => {
      const txt = await freecdn.fetchText('/open-delay')
      expect(txt).eq('3')
    })
  })


  describe('recv_timeout', () => {
    it('basic', async () => {
      const txt = await freecdn.fetchText('/recv-delay')
      expect(txt).include('4')
    }).timeout(1000 * 20)
  })
})