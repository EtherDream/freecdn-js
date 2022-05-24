'use strict'

describe('basic', () => {
  const freecdn = new FreeCDN('manifest-basic.conf')
  freecdn.enableCacheStorage = false

  before(async() => {
    await freecdn.init()
  })

  describe('file proxy', () => {
    it('1st to 3rd', async () => {
      const ret = await freecdn.fetchText('/api/get-server-addr')
      expect(ret).eq('127.0.0.1:10003')
    })

    it('1st to 1st', async () => {
      const ret = await freecdn.fetchText('/hello')
      expect(ret).eq('Hello World')
    })

    it('3rd to 1st', async () => {
      const ret = await freecdn.fetchText('http://127.0.0.1:10003/api/get-server-addr')
      // 当前站点的权重默认最低，因此优先访问第三方资源
      expect(ret).eq('127.0.0.1:10003')
    })

    it('3rd to 3rd', async () => {
      const ret = await freecdn.fetchText('http://127.0.0.1:10003/assets/hello.txt')
      expect(ret).eq('Hello World')
    })

    it('ignore query', async () => {
      const res = await freecdn.fetch('/get-file.html')
      const ret = await res.text()

      expect(ret).eq('Hello World')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/html'})
    })

    it('url with query', async () => {
      const res = await freecdn.fetch('/get-file.html?key=test.gif')
      const ret = await res.text()

      expect(ret).eq('hello2')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'text/plain'})
    })

    it('fallback', async () => {
      const ret = await freecdn.fetchText('/fallback')
      expect(ret).eq('Hello World')
    })

    it('forward', async () => {
      const ret = await freecdn.fetchText('/cgi.php')
      expect(ret).eq('dynamic data')
    })

    it('1st try index page', async () => {
      const ret = await freecdn.fetchText('/path/to/')
      expect(ret).eq('Hello World')
    })

    it('1st redir to index page', async () => {
      const res = await freecdn.fetch('/path/to')
      expect(res.status).eq(302)
      expect(Object.fromEntries(res.headers))
        .include({'location': location.origin + '/path/to/'})
    })

    it('3rd try index page', async () => {
      const ret = await freecdn.fetchText('http://127.0.0.1:10003/path/to/')
      expect(ret).eq('Hello World')
    })

    it('3rd redir to index page', async () => {
      const res = await freecdn.fetch('http://127.0.0.1:10003/path/to')
      expect(res.status).eq(302)
      expect(Object.fromEntries(res.headers))
        .include({'location': 'http://127.0.0.1:10003/path/to/'})
    })

    it('merge slashes', async () => {
      const ret = await freecdn.fetchText('/path//to///')
      expect(ret).eq('Hello World')
    })
  })

  describe('dir proxy', () => {
    it('1st', async () => {
      const ret = await freecdn.fetchText('/api/works')
      expect(ret).eq('works')
    })

    it('3rd', async () => {
      const ret = await freecdn.fetchText('http://127.0.0.1:10003/api-proxy/works')
      expect(ret).eq('works')
    })
  })


  describe('body proxy', () => {
    async function send(method) {
      const body = new Uint8Array([0x00, 0x11, 0x22, 0x33])
      const res = await freecdn.fetch('/api/echo-body', {method, body})
      const buf = await res.arrayBuffer()
      const arr = new Uint8Array(buf)
      expect(arr).deep.eq(body)
    }

    it('post', async () => {
      await send('POST')
    })

    it('put', async () => {
      await send('PUT')
    })
  })

  describe('range request', () => {
    it('range', async () => {
      for (let i = 0; i < 10; i++) {
        const fileLen = 1234567
        const len = Math.random() * fileLen | 0
        const begin = Math.random() * fileLen | 0
        const end = Math.min(begin + len, fileLen)
  
        const req = new Request('/range-file', {
          headers: {
            range: `bytes=${begin}-${end}`
          }
        })
        const res = await freecdn.fetch(req)
        const buf = await res.arrayBuffer()
        const bin = new Uint8Array(buf)
        const exp = randBytes(fileLen, 1)
  
        expect(res.status).eq(206)
        expect(bin).deep.eq(exp.subarray(begin, end))
      }
    })

    it('range-no-end', async () => {
      for (let i = 0; i < 10; i++) {
        const fileLen = 1234567
        const begin = Math.random() * fileLen | 0
        const req = new Request('/range-file', {
          headers: {
            range: `bytes=${begin}-`
          }
        })
        const res = await freecdn.fetch(req)
        const buf = await res.arrayBuffer()
        const bin = new Uint8Array(buf)
        const exp = randBytes(fileLen, 1)

        expect(res.status).eq(206)
        expect(bin).deep.eq(exp.subarray(begin))
      }
    })
  })


  describe('img upgrade', () => {
    it('no upgrade', async () => {
      const ret = await freecdn.fetchText('/assets/img/foo.png')
      expect(ret).eq('data-foo-png')
    })

    it('1st upgrade to webp', async () => {
      const req = new Request('/assets/img/foo.png', {
        mode: 'no-cors',
        headers: {
          'Accept': 'image/webp',
        }
      })
      const res = await freecdn.fetch(req)
      const ret = await res.text()

      expect(ret).eq('data-foo-png-webp')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'image/webp'})
    })

    it('1st upgrade to avif', async () => {
      const req = new Request('/assets/img/foo.png', {
        mode: 'no-cors',
        headers: {
          'Accept': 'image/webp, image/avif',
        }
      })
      const res = await freecdn.fetch(req)
      const ret = await res.text()

      expect(ret).eq('data-foo-png-avif')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'image/avif'})
    })

    it('3rd upgrade to webp', async () => {
      const req = new Request('http://127.0.0.1:10003/assets/img/foo.png', {
        mode: 'no-cors',
        headers: {
          'Accept': 'image/webp',
        }
      })
      const res = await freecdn.fetch(req)
      const ret = await res.text()

      expect(ret).eq('data-foo-png-webp')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'image/webp'})
    })

    it('3rd upgrade to avif', async () => {
      const req = new Request('http://127.0.0.1:10003/assets/img/foo.png', {
        mode: 'no-cors',
        headers: {
          'Accept': 'image/webp, image/avif',
        }
      })
      const res = await freecdn.fetch(req)
      const ret = await res.text()

      expect(ret).eq('data-foo-png-avif')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'image/avif'})
    })

    it('url contains slashes and query', async () => {
      const req = new Request('/assets//img///foo.png?v=1', {
        mode: 'no-cors',
        headers: {
          'Accept': 'image/webp',
        }
      })
      const res = await freecdn.fetch(req)
      const ret = await res.text()

      expect(ret).eq('data-foo-png-webp')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'image/webp'})
    })

    it('cors mode', async () => {
      const req = new Request('/assets/img/foo.png', {
        mode: 'cors',
        headers: {
          'Accept': 'image/webp, image/avif',
        }
      })
      const res = await freecdn.fetch(req)
      const ret = await res.text()

      expect(ret).eq('data-foo-png')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'image/png'})
    })

    it('with integrity', async () => {
      const req = new Request('/assets/img/foo.png', {
        integrity: 'sha256-C583ny/viqs/Z/5Lznqp7nIDJIZKW9hGLZYsYGTLQvc=',
        headers: {
          'Accept': 'image/webp, image/avif',
        }
      })
      const res = await freecdn.fetch(req)
      const ret = await res.text()

      expect(ret).eq('data-foo-png')
      expect(Object.fromEntries(res.headers))
        .include({'content-type': 'image/png'})
    })
  })
})