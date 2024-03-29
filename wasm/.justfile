_default:
    @just --list --unsorted

export MIRIFLAGS := '-Zmiri-symbolic-alignment-check -Zmiri-strict-provenance'
wasmTarget := 'wasm32-unknown-unknown'
targetDir := 'target' / wasmTarget / 'release'
wasmFile := targetDir / 'blackbox-log.wasm'

# Run rustfmt
fmt *args='':
    cargo +nightly fmt {{ args }}

# Run clippy using cargo-cranky
check *args='--all-features':
    cargo cranky --all-targets {{ args }}

# Run tests
test *args='':
    cargo nextest run --all-features --status-level=leak {{ args }}

# Run all tests
test-all:
    cargo nextest run --all-features --status-level=leak --run-ignored=all

# Run tests with miri (native)
miri:
    cargo +nightly miri nextest run

# Run tests with miri (wasm)
miri-wasm:
    cargo +nightly miri test --target {{ wasmTarget }}

# Generate a full test coverage report using cargo-llvm-cov
cov *args='':
    cargo llvm-cov --all-features --html nextest --status-level=leak --run-ignored=all {{ args }}

# Run cargo build
build:
    cargo build --release --target {{ wasmTarget }}
    @cp {{ targetDir / 'blackbox_log_wasm.wasm' }} {{ wasmFile }}

# Set start function
set-start:
    wasm-set-start {{ wasmFile }} set_panic_hook

# Apply multi-value transform
multivalue:
    wasm-multi-value-reverse-polyfill {{ wasmFile }} \
        'data_new i32 i32' \
        'data_stats i32 i32 i32 i32 i32 f32' \
        'filter_new i32 i32' \
        'headers_firmwareRevision i32 i32' \
        'headers_firmwareDate i32 i32 i32 i32 i32 i32 i32' \
        'headers_firmwareVersion i32 i32 i32' \
        'headers_boardInfo i32 i32' \
        'headers_craftName i32 i32' \
        'headers_debugMode i32 i32' \
        'headers_disabledFields i32 i32' \
        'headers_features i32 i32' \
        'headers_pwmProtocol i32 i32' \
        'headers_unknown i32 i32'

    @mv {{ targetDir / 'blackbox-log.multivalue.wasm' }} {{ wasmFile }}

# Run wasm-opt
opt:
    wasm-opt {{ wasmFile }} -o {{ wasmFile }} \
        --merge-similar-functions --optimize-instructions --reorder-functions --rse --simplify-locals -O3 \
        --enable-bulk-memory --enable-multivalue --enable-sign-ext

# Full build & optimize, then copy into place
wasm: build set-start multivalue opt
    cp {{ wasmFile }} ../src/blackbox-log.wasm

# Show disassembly
dis:
    wasm-dis {{ wasmFile }} | less

# Install/update all dev tools from crates.io
install:
    @just install-min
    cargo install --locked \
        cargo-cranky \
        cargo-criterion \
        cargo-llvm-cov \
        cargo-nextest \
        flamegraph

# Install/update only the tools required to build .wasm file
install-min:
    cargo install --locked wasm-opt
    cargo install --locked --git https://github.com/wetheredge/wasm-multi-value-reverse-polyfill
    cargo install --locked --git https://github.com/wetheredge/wasm-set-start
