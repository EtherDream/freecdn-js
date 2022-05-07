//
// Promise Utils
//
type may_async<T> = T | Promise<T>

type resolve_t<T> = (value: may_async<T>) => void
type reject_t = (reason?: any) => void


interface PromiseX<T = void> extends Promise<T> {
  readonly resolve: resolve_t<T>
  readonly reject: reject_t
}

// non-callback style Promise
function promisex<T = void>() : PromiseX<T> {
  let resolve: resolve_t<T>
  let reject: reject_t

  const p = new Promise((a, b) => {
    resolve = a
    reject = b
  }) as PromiseX<T>

  // @ts-ignore
  p.resolve = resolve

  // @ts-ignore
  p.reject = reject

  return p
}

// faster than instanceof
function isPromise(obj: any /* except nullable */ | Promise<any>) : obj is Promise<any> {
  return typeof obj.then === 'function'
}