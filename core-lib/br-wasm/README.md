
# brotli decompression module

## install

brotli:

```bash
git clone https://github.com/google/brotli.git
```

emscripten:

https://emscripten.org/docs/getting_started/downloads.html

terser:

```bash
npm install terser -g
```

## compile

```bash
emmake make
```

output:

* `br.wasm`

* `br.js`

* `br.min.js`

path: `../dist/freecdn-internal/dev/br/`