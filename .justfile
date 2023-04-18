_default:
    @just --list --unsorted

# Run prettier
fmt:
    pnpm prettier --write .

# Check formatting, lints, and types
check: && lint typecheck
    pnpm prettier --check .

# Run eslint
lint:
    pnpm eslint src

# Run typechecking
typecheck:
    pnpm tsc --noEmit

# Run the dev server
dev *args='':
    pnpm vite {{ args }}

# Check types and build for production
build:
    rm -rf dist/
    pnpm tsc --emitDeclarationOnly
    pnpm vite build
    pnpm vite --config vite.worker.config.js build

# Build API documentation
doc: _doc

[unix]
_doc:
    sed '1 s/`//g; s|https://blackbox-log.github.io/blackbox-log-ts||g' README.md > .docs-readme.md
    pnpm typedoc --readme .docs-readme.md
    rm .docs-readme.md

[windows]
_doc:
    pnpm typedoc

# Remove build artifacts
clean:
    rm -f src/blackbox-log.wasm
    rm -rf dist

# Regenerate .wasm
wasm:
    @just wasm/wasm
