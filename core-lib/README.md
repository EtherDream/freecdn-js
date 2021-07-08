# 简介

freecdn 核心库，可脱离 Service Worker 运行，方便开发和测试。


# 案例

manifest.conf:

```conf
/assets/bootstrap.css
	https://ajax.cdnjs.com/ajax/libs/twitter-bootstrap/4.1.3/css/bootstrap.min.css
	https://cdnjs.loli.net/ajax/libs/twitter-bootstrap/4.1.3/css/bootstrap.min.css
	https://lib.baomitu.com/twitter-bootstrap/4.1.3/css/bootstrap.min.css
	https://cdn.bootcss.com/twitter-bootstrap/4.1.3/css/bootstrap.min.css
	hash=eSi1q2PG6J7g7ib17yAaWMcrr5GrtohYChqibrV7PBE=

/assets/jquery.js
	https://ajax.cdnjs.com/ajax/libs/jquery/3.2.1/jquery.min.js
	https://cdnjs.loli.net/ajax/libs/jquery/3.2.1/jquery.min.js
	https://lib.baomitu.com/jquery/3.2.1/jquery.min.js
	https://cdn.bootcss.com/jquery/3.2.1/jquery.min.js
	hash=hwg4gsxgFZhOsEEamdOYGBf13FyQuiTwlAQgxVSNgt4=

/assets/logo.png
	https://ajax.cdnjs.com/ajax/libs/browser-logos/27.0.0/chrome/chrome_256x256.png
	https://cdnjs.loli.net/ajax/libs/browser-logos/27.0.0/chrome/chrome_256x256.png
	https://lib.baomitu.com/browser-logos/27.0.0/chrome/chrome_256x256.png
	https://cdn.bootcss.com/browser-logos/27.0.0/chrome/chrome_256x256.png
	hash=xu9Z5KyV9e/6LZbm1NiC/CltaMTbEEwVdzEv2OWsHVo=
```

js:

```js
const freecdn = new FreeCDN('manifest.conf')
await freecdn.init()

const js = await freecdn.fetchText('/assets/jquery.js')
window.eval(js)

const css = await freecdn.fetchText('/assets/bootstrap.css')
styleTest.textContent = css

const blob = await freecdn.fetchBlob('/assets/logo.png')
imgTest.src = URL.createObjectURL(blob)
```

# 演示

```bash
http-server
```

http://127.0.0.1:8080/examples/hello/index.html


# 开发

```bash
tsc -w
```

生成 `dist/freecdn.js`。


# 测试

```bash
cd test
node server
```


# 应用

该 lib 也可用于其他项目。不过本程序使用 ES2020 开发，无法直接在低版本浏览器中运行。
