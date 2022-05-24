'use strict'
const express = require('express')
const cors = require('cors')
const app = express()

app.use(cors())
app.use(express.static('client'))
app.use('/libs', express.static('../../node_modules/mocha'))
app.use('/libs', express.static('../../node_modules/chai'))
app.use(express.static('../dist'))

app.get('/api/works', (req, res) => {
  res.send('works')
})

app.get('/api/set-status', (req, res) => {
  const {status} = req.query
  res.status(+status)
  res.send(status)
})

app.get('/api/get-server-addr', (req, res) => {
  const ip = req.socket.localAddress.replace('::ffff:', '')
  res.end(ip + ':' + req.socket.localPort)
})

app.get('/api/no-mime', (req, res) => {
  res.end('hello')
})

// POST or PUT
app.use('/api/echo-body', (req, res) => {
  setTimeout(() => {
    res.status(200)
    req.pipe(res)
  }, +req.query.delay)
})

app.get('/api/echo-headers', (req, res) => {
  const json = JSON.stringify(req.headers, null, 2)
  res.contentType('text/json')
  res.send(json)
})

app.get('/api/set-res-headers', (req, res) => {
  const keys = []
  for (const [k, v] of Object.entries(req.query)) {
    res.header(k, v)
    keys.push(k)
  }
  res.header('access-control-expose-headers', keys.join(', '))
  res.send('ok')
})

app.get('/api/xor', (req, res) => {
  const {data, key} = req.query
  const buf = Buffer.from(data)
  const nKey = +key
  for (let i = 0; i < buf.length; i++) {
    buf[i] ^= nKey
  }
  res.send(buf)
})

// delay
app.get('/api/delay-res', (req, res) => {
  setTimeout(() => {
    res.send(req.query.data)
  }, +req.query.time)
})

app.get('/api/delay-write', (req, res) => {
  res.socket.setNoDelay()
  res.writeHead(200)
  // res.write('>')

  let i = 0
  const delay = +req.query.delay
  const count = +req.query.count
  const size = +req.query.size
  const char = req.query.data
  const data = char.repeat(size)

  const tid = setInterval(() => {
    res.write(data)
    if (++i === count) {
      clearInterval(tid)
      res.end()
    }
  }, delay)
})


app.get('/api/rand-data', (req, res) => {
  res.writeHead(200)
  const len = +req.query.len
  const seed = +req.query.seed

  const buf = Buffer.allocUnsafe(len)
  let key = ~seed
  for (let i = 0; i < len; i++) {
    key *= 31
    buf[i] = key
  }
  res.end(buf)
})

// 1st site
app.listen(10001, () => {
  console.log('test page: http://127.0.0.1:10001/index.html?a=1&b=2#zzz')
})

// 3rd site
app.listen(10002)
app.listen(10003)
app.listen(10004)