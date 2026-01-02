emcc main.cpp -o main.js -O3 -flto -s WASM=1 -s "EXPORTED_RUNTIME_METHODS=['ccall', 'cwrap']" -s EXPORT_ES6=1 -s MODULARIZE=1 -s ENVIRONMENT=web -s ALLOW_MEMORY_GROWTH=1 --bind
