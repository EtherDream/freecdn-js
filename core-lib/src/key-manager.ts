namespace KeyManager {
  let mKey: CryptoKey


  export async function set(keyBase64: string) {
    const keyBin = base64Decode(keyBase64)
    if (!keyBin) {
      return
    }
    mKey = await CRYPTO.importKey('spki', keyBin, {
      name: 'ECDSA',
      namedCurve: 'P-256',
    }, false, ['verify'])
  }

  export async function verify(data: Uint8Array) {
    if (!mKey) {
      return false
    }
    const linePos = data.lastIndexOf(10)  // 10 = '\n'
    const lineBin = data.subarray(linePos + 1)
    const lineTxt = bytesToUtf8(lineBin)

    const m = lineTxt.match(/# SIGN: ([A-Za-z0-9+/=]{88})$/)
    if (!m) {
      return false
    }
    const signTxt = m[1]
    const signBin = base64Decode(signTxt) as Uint8Array
    const dataBin = data.subarray(0, linePos)

    return await CRYPTO.verify({
      name: 'ECDSA',
      hash: {
        name: 'SHA-256'
      },
    }, mKey, signBin, dataBin)
  }
}