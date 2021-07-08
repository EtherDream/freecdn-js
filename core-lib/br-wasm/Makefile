# source "/Users/zjc/tool/emsdk/emsdk_env.sh"
# emmake make

DIST = ../dist/freecdn-internal/dev/br


$(DIST)/br.min.js: $(DIST)/br.js
	terser \
		$(DIST)/br.js \
		-o $(DIST)/br.min.js \
		--compress drop_console \
		--enclose 'Module:Module' \
		--mangle

$(DIST)/br.js: main.c brotli/libbrotli.a
	mkdir -p $(DIST)
	emcc -O2 main.c \
		-o $(DIST)/br.js \
		-I brotli/c/include \
		-L brotli -l libbrotli \
		-s WASM=1 \
		-s ALLOW_MEMORY_GROWTH=1 \
		-s ENVIRONMENT=worker \
		-s FILESYSTEM=0 \
		-s TEXTDECODER=2

brotli/libbrotli.a:
	./brotli/configure
	make lib --directory brotli

.PHONY: clean
clean:
	rm -rf $(DIST)/br.js
	rm -rf $(DIST)/br.min.js
	rm -rf $(DIST)/br.wasm
