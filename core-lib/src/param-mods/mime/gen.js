const MIME_MAP = require('./standard')

const str = Object.entries(MIME_MAP)
  .map(([k, v]) =>
    k + ':' + v.join(',').replace(/\*/g, '')
  )
  .join(';')

const code = `const MIME_DATA = '${str}'`
console.log(code)
