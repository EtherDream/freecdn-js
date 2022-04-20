/**
 * JS Hook Util
 * example: https://codepen.io/etherdream/pen/WNoQQbG?editors=0012
 */
namespace Hook {
  /**
   * hook function
   */
  export function func<
    T, K extends keyof T,

    // T[K] must be a function
    F = T[K] extends (...args: infer P) => infer R
      ? (this: T, ...args: P) => R
      : never
  >(
    obj: T,
    key: K,
    factory: (oldFn: F) => F
  ) {
    const oldFn: F = obj[key] as any
    if (!oldFn) {
      return false
    }
    const newFn = factory(oldFn)
    obj[key] = newFn as any
    return true
  }

  /**
   * hook property
   */
  export function prop<
    T, K extends keyof T,

    GETTER extends (this: T) => T[K],
    SETTER extends (this: T, value: T[K]) => void,

    GETTER_FACTORY extends (oldGetter: GETTER) => GETTER,
    SETTER_FACTORY extends (oldSetter: SETTER) => SETTER,
  >(
    obj: T,
    key: K,
    getterFactory: GETTER_FACTORY | null,
    setterFactory: SETTER_FACTORY | null,
  ) {
    const desc = Object.getOwnPropertyDescriptor(obj, key)
    if (!desc) {
      return false
    }
    if (getterFactory) {
      func(desc, 'get', getterFactory)
    }
    if (setterFactory) {
      func(desc, 'set', setterFactory)
    }
    Object.defineProperty(obj, key, desc)
    return true
  }
}
