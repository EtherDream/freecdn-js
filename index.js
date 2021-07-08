exports.ver = require('./package.json').version
exports.dir = __dirname + '/dist/'
exports.devFiles = [
  'freecdn-main.js',
  'freecdn-main.js.map',
  'fail.js',
  'br/br.js',
  'br/br.wasm',
]
exports.buildFiles = [
  'freecdn-main.min.js',
  'fail.min.js',
  'br/br.min.js',
  'br/br.wasm',
]