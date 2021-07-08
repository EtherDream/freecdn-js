//
// non-callback style Promise
//
type resolve_t<T> = (value: T | Promise<T>) => void
type reject_t = (reason?: any) => void


interface PromiseX<T = void> extends Promise<T> {
  readonly resolve: resolve_t<T>
  readonly reject: reject_t
}


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