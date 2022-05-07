interface RequestArgs extends RequestInit {
  headers: Headers
}

interface ResponseArgs extends ResponseInit {
  headers: Headers
  status: number
  statusText: string
}

class ParamError extends Error {
  public constructor(message: string) {
    super(message)
  }
}

abstract class ParamBase {
  public onRequest(reqArgs: RequestArgs, fileLoader: FileLoader) : may_async<Response | void> {
  }

  public onResponse(resArgs: ResponseArgs, fileLoader: FileLoader, rawRes: Response) : void {
  }

  public onData(chunk: Uint8Array) : may_async<Uint8Array> {
    return chunk
  }

  public onEnd(chunk: Uint8Array) : may_async<Uint8Array> {
    return chunk
  }

  public onError(error: any) : void {
  }

  public onAbort(reason: any) : void {
  }
}

interface ParamSub {
  new(...args: any[]) : ParamBase

  reuse?: boolean

  parseConf(conf: string) :
    any[] |     // construct args
    string |    // error info
    undefined   // off

  priority?: number
}