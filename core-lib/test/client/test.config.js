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
        'a': '3',
      })
  })

  it('host params', async () => {
    const req = new Request('/host-params')
    const res = await freecdn.fetch(req)
    expect(Object.fromEntries(res.headers))
      .include({
        'content-type': 'text/host',
        'a': '2',
      })
  })

  it('global params', async () => {
    const req = new Request('/global-params')
    const res = await freecdn.fetch(req)
    expect(Object.fromEntries(res.headers))
      .include({
        'content-type': 'text/global',
        'a': '1',
      })
  })

  it('include confs', async () => {
    const ret = await freecdn.fetchText('/file-a')
    expect(ret).eq('2020-01-01')
  })
})
