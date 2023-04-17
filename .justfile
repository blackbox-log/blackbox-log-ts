_default:
    @just --list --unsorted

# Run prettier
fmt:
    pnpm prettier --write .

# Check formatting, lints, and types
check:
    pnpm prettier --check .
    pnpm eslint src
    pnpm tsc

# Run the dev server
dev *args='':
    pnpm vite {{ args }}

# Check types and build for production
build: && build-worker
    pnpm tsc
    pnpm vite build

build-worker:
    pnpm vite --config vite.worker.config.js build

# Build API documentation
doc:
    pnpm typedoc

# Remove build artifacts
clean:
    rm -f src/blackbox-log.wasm
    rm -rf dist

# Regenerate .wasm
wasm:
    @just wasm/wasm
