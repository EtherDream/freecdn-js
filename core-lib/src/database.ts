class Database {
  private db!: IDBDatabase


  public constructor(
    private readonly name: string
  ) {
  }

  public open(opts: {
    [table: string] : IDBObjectStoreParameters
  }) {
    const s = promisex()
    const req = indexedDB.open(this.name)

    req.onsuccess = () => {
      const idb = req.result
      this.db = idb

      idb.onclose = () => {
        console.warn('[FreeCDN/Database] indexedDB disconnected, reopen...')
        this.open(opts)
      }
      s.resolve()
    }
    req.onerror = (e) => {
      console.warn('[FreeCDN/Database] indexedDB open error:', e)
      s.reject(req.error)
    }
    req.onupgradeneeded = () => {
      const idb = req.result
      for (const [k, v] of Object.entries(opts)) {
        idb.createObjectStore(k, v)
      }
    }
    return s
  }

  public close() {
    this.db.close()
  }

  public get(table: string, key: any) {
    const s = promisex<any>()
    const obj = this.getStore(table, 'readonly')
    const req = obj.get(key)

    req.onsuccess = () => {
      s.resolve(req.result)
    }
    req.onerror = () => {
      s.reject(req.error)
    }
    return s
  }

  public put(table: string, record: any) {
    const s = promisex()
    const obj = this.getStore(table, 'readwrite')
    const req = obj.put(record)

    req.onsuccess = () => {
      s.resolve()
    }
    req.onerror = () => {
      s.reject(req.error)
    }
    return s
  }

  public delete(table: string, key: any) {
    const s = promisex()
    const obj = this.getStore(table, 'readwrite')
    const req = obj.delete(key)

    req.onsuccess = () => {
      s.resolve()
    }
    req.onerror = () => {
      s.reject(req.error)
    }
    return s
  }

  public enum(
    table: string,
    callback: (result: any) => boolean | void,
    ...args: Parameters<typeof IDBObjectStore.prototype.openCursor>
  ) {
    const s = promisex()
    const obj = this.getStore(table, 'readonly')
    const req = obj.openCursor(...args)

    req.onsuccess = () => {
      const {result} = req
      if (!result) {
        s.resolve()
        return
      }
      const ret = callback(result.value)
      if (ret !== false) {
        result.continue()
      }
    }
    req.onerror = () => {
      s.reject(req.error)
    }
    return s
  }

  private getStore(table: string, mode: IDBTransactionMode) {
    return this.db
      .transaction(table, mode)
      .objectStore(table)
  }
}
