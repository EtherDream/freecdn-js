'use strict'

describe('config', () => {
  const freecdn = new FreeCDN('manifest-config.conf')
  freecdn.enableCacheStorage = false

  before(async() => {
    await freecdn.init()
  })

  it('inline params', async () => {
    const req = new Request('/inline-params')
    const res = await freecdn.fetch(req)
    expect(Object.fromEntries(res.headers))
      .include({
        'content-type': 'text/inline',
        'cache-control': 'max-age=10',
      })
  })

  it('host params', async () => {
    const req = new Request('/host-params')
    const res = await freecdn.fetch(req)
    expect(Object.fromEntries(res.headers))
      .include({
        'content-type': 'text/host',
        'cache-control': 'max-age=20',
      })
  })

  it('global params', async () => {
    const req = new Request('/global-params')
    const res = await freecdn.fetch(req)
    expect(Object.fromEntries(res.headers))
      .include({
        'content-type': 'text/global',
        'cache-control': 'max-age=60',
      })
  })

  it('include confs', async () => {
    const ret = await freecdn.fetchText('/file-a')
    expect(ret).eq('2020-01-01')
  })
})
