const crypto = require('crypto')
const zlib = require('zlib')
const fs = require('fs')

const gulp = require('gulp')
const ts = require('gulp-typescript')
const rename = require("gulp-rename")
const terser = require('gulp-terser')
const replace = require('gulp-replace')
const sourcemaps = require('gulp-sourcemaps')
const VER = require('./package.json').version

const MAIN_JS_SRC = ['main-js/src/**/*.ts', 'core-lib/src/**/*.ts']
const LOADER_JS_SRC = ['loader-js/src/**/*.ts']
const FAIL_JS_SRC = ['fail-js/src/**/*.ts']

const DEV_ASSETS = 'core-lib/dist/freecdn-internal/dev'


function getFileHash(file) {
  const data = fs.readFileSync(file)
  const buf = crypto.createHash('sha256').update(data).digest()
  return buf.toString('base64')
}

//
// main-js
//
gulp.task('compile-main-js', () => {
  const opt = require('./main-js/tsconfig.json').compilerOptions
  return gulp
    .src(MAIN_JS_SRC)
    .pipe(sourcemaps.init())
    .pipe(ts(opt))
    .pipe(sourcemaps.write('.'))
    .pipe(gulp.dest('dist'))
})

gulp.task('minify-main-js', gulp.series('compile-main-js', () => {
  const opt = {
    compress: {
      global_defs: {
        VER,
        RELEASE: 1,
        BR_WASM_HASH: getFileHash(`${DEV_ASSETS}/br/br.wasm`),
        BR_GLUE_HASH: getFileHash(`${DEV_ASSETS}/br/br.min.js`),
      },
      drop_debugger: false,
      ecma: 2020,
    },
    mangle: true,
    enclose: true,
  }
  return gulp
    .src('dist/freecdn-main.js')
    .pipe(sourcemaps.init({loadMaps: true}))
    .pipe(terser(opt))
    .pipe(rename('freecdn-main.min.js'))
    .pipe(sourcemaps.write('.', {
      sourceMappingURLPrefix: `https://unpkg.com/freecdn-js@${VER}/dist`
    }))
    .pipe(gulp.dest('dist'))
}))

//
// fail js
//
gulp.task('compile-fail-js', () => {
  const opt = require('./fail-js/tsconfig.json').compilerOptions
  return gulp
    .src(FAIL_JS_SRC)
    .pipe(ts(opt))
    .pipe(gulp.dest('dist'))
})

gulp.task('minify-fail-js', gulp.series('compile-fail-js', () => {
  const opt = {
    compress: {
      drop_console: true,
    },
    enclose: true,
    mangle: true,
    ie8: true,
  }
  return gulp
    .src('dist/fail.js')
    .pipe(terser(opt))
    .pipe(rename('fail.min.js'))
    .pipe(gulp.dest('dist'))
}))

//
// loader-js
//
function getPublicKey() {
  const file = 'dist/freecdn-loader.js'
  if (fs.existsSync(file)) {
    const m = fs.readFileSync(file, 'utf8').match(/'([A-Za-z0-9/+]{86})'/)
    if (m) {
      return m[1]
    }
  }
  // dummy
  return 'ph6xwrkk4+YmD5hTPsTwcPIfnvue7NnidswLL15UWz8/EuTvyN7rMtPqgRcHXD8JWf+HNCclxa4v6g3pgl12PQ'
}

gulp.task('compile-loader-js', () => {
  const key = getPublicKey()
  const opt = require('./loader-js/tsconfig.json').compilerOptions
  return gulp
    .src(LOADER_JS_SRC)
    .pipe(ts(opt))
    .pipe(replace(/PUBLIC_KEY_PLACEHOLDER|[A-Za-z0-9/+]{86}/, `'${key}'`))
    .pipe(gulp.dest('dist'))
})

gulp.task('minify-loader-js', gulp.series('compile-loader-js', 'minify-main-js', () => {
  const opt = {
    compress: {
      global_defs: {
        VER,
        RELEASE: 1,
        MAIN_JS_HASH: 'sha256-' + getFileHash('dist/freecdn-main.min.js'),
      },
    },
    mangle: true,
    ie8: true,
  }
  return gulp
    .src('dist/freecdn-loader.js')
    .pipe(terser(opt))
    .pipe(rename('freecdn-loader.min.js'))
    .pipe(gulp.dest('dist'))
}))

function showLoaderSize() {
  const input = fs.readFileSync('dist/freecdn-loader.min.js')
  const output = zlib.brotliCompressSync(input, {
    chunkSize: input.length,
    params: {
      [zlib.constants.BROTLI_PARAM_MODE] : zlib.constants.BROTLI_MODE_TEXT,
      [zlib.constants.BROTLI_PARAM_QUALITY]: zlib.constants.BROTLI_MAX_QUALITY,
    },
  })
  console.log('loader-js:')
  console.log('uncompressed bytes:', input.length)
  console.log('    brotlied bytes:', output.length)
}


gulp.task('brwasm', () => {
  return gulp
    .src(`${DEV_ASSETS}/br/*`)
    .pipe(gulp.dest('dist/br'))
})

//
// [dev]
//
gulp.task('dev', gulp.parallel('compile-loader-js', 'compile-main-js', () => {
  gulp.watch(LOADER_JS_SRC, gulp.series('compile-loader-js'))
  gulp.watch(MAIN_JS_SRC, gulp.series('compile-main-js'))
  gulp.watch(FAIL_JS_SRC, gulp.series('compile-fail-js'))
}))

//
// [build]
//
gulp.task('build', gulp.series(
  'brwasm',
  'minify-fail-js',
  'minify-loader-js',
  async () => {
    showLoaderSize()
  })
)
