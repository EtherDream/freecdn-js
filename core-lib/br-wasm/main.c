#include <stdlib.h>
#include <brotli/decode.h>

#ifdef __EMSCRIPTEN__
  #include <emscripten.h>
#else
  #define EMSCRIPTEN_KEEPALIVE
#endif

uint8_t* gInBufPtr;
uint8_t* gOutBufPtr;

size_t gInBufLen;
size_t gOutBufLen;

size_t gAvailableIn;
size_t gAvailableOut;


EMSCRIPTEN_KEEPALIVE
uint8_t* AllocInBuf(size_t len) {
  gInBufPtr = malloc(len);
  gInBufLen = len;
  return gInBufPtr;
}


EMSCRIPTEN_KEEPALIVE
uint8_t* AllocOutBuf(size_t len) {
  gOutBufPtr = malloc(len);
  gOutBufLen = len;
  return gOutBufPtr;
}


EMSCRIPTEN_KEEPALIVE
BrotliDecoderState* Init() {
  BrotliDecoderState* s = BrotliDecoderCreateInstance(NULL, NULL, NULL);
  BrotliDecoderSetParameter(s, BROTLI_DECODER_PARAM_LARGE_WINDOW, 1u);
  return s;
}


EMSCRIPTEN_KEEPALIVE
int HasMoreOutput(BrotliDecoderState* s) {
  return BrotliDecoderHasMoreOutput(s);
}


EMSCRIPTEN_KEEPALIVE
int Update(BrotliDecoderState* s, size_t offset, size_t dataLen) {
  gAvailableIn = dataLen;
  gAvailableOut = gOutBufLen;

  const uint8_t* inBufPtr = gInBufPtr + offset;
  uint8_t* outBufPtr = gOutBufPtr;

  return BrotliDecoderDecompressStream(s,
    &gAvailableIn, &inBufPtr,
    &gAvailableOut, &outBufPtr, NULL);
}


EMSCRIPTEN_KEEPALIVE
int GetAvailableIn() {
  return gAvailableIn;
}


EMSCRIPTEN_KEEPALIVE
int GetAvailableOut() {
  return gAvailableOut;
}


EMSCRIPTEN_KEEPALIVE
void Destroy(BrotliDecoderState* s) {
  BrotliDecoderDestroyInstance(s);
}

EMSCRIPTEN_KEEPALIVE
int GetErrorCode(BrotliDecoderState* s) {
  return BrotliDecoderGetErrorCode(s);
}
