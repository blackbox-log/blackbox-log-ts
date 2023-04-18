# `blackbox-log-ts`

[![CI](https://github.com/blackbox-log/blackbox-log-ts/actions/workflows/ci.yaml/badge.svg)](https://github.com/blackbox-log/blackbox-log-ts/actions/workflows/ci.yaml)
[![npm](https://img.shields.io/npm/v/blackbox-log)](https://npmjs.com/blackbox-log)
[![snyk](https://img.shields.io/snyk/vulnerabilities/npm/blackbox-log)](https://snyk.io/advisor/npm-package/blackbox-log)
[![license](https://img.shields.io/github/license/blackbox-log/blackbox-log-ts)](https://github.com/blackbox-log/blackbox-log-ts/blob/main/COPYING)

This is a TypeScript library to parse blackbox log files from [Betaflight] & [INAV] on the web &
cross-platform without needing the official `blackbox_decode`, which is somewhat out-of-date. The
parser itself is [this Rust library][rust repo] compiled to WebAssembly.

## Installation

Install from NPM under the name `blackbox-log`:

```shell
$ pnpm add blackbox-log  # or npm or yarn
```

This package uses [conditional exports]. TypeScript gained support for this in [version 5.0][ts 5.0]
with `"moduleResolution": "bundler"` or in [version 4.7][ts 4.7] with
`"moduleResolution": "nodenext"`.

## Usage

This package exposes both a synchronous, single-threaded API and an asynchronous, multi-threaded
API. Both are very similar and are designed to parallel [the Rust API][rust docs].

Both APIs are provided by the default entrypoint along with the inlined WebAssembly & worker. Or,
using the `blackbox-log/sync` or `blackbox-log/async` entrypoints will likely reduce bundle size,
but do require the WebAssembly (and worker for `/async`) to be loaded separately.

Below are examples of each API. Also check out the [full API docs][docs] built from the latest
`main` branch.

### Sync API

[API docs](https://blackbox-log.github.io/blackbox-log-ts/modules/sync.html)

```javascript
import { Parser, getWasm } from 'blackbox-log';
// Initialize the parser with the inlined WebAssembly module
const parser = await Parser.init(getWasm());

// Or:

import Parser from 'blackbox-log/sync';
import wasmUrl from 'blackbox-log/wasm?url'; // This is for vite; check your bundler docs
// Download and init from the url
const parser = await Parser.init(wasmUrl);

// ---

const rawFile = new File(); // From a file input on the web, the filesystem in Node, etc
const buffer = await rawFile.arrayBuffer();

const file = parser.loadFile(buffer);
const logCount = file.logCount;
const log = 0;

const headers = file.parseHeaders(log); // Parse just the headers of the first log
console.log(
	`Log ${log + 1} of ${logCount + 1}: ${headers.firmwareKind} v${headers.firmwareVersion}`.concat(
		headers.craftName ? ` named '${headers.craftName}'` : '',
	),
);

const data = await headers.getDataParser();
for (const { kind, data } of data) {
	// Handle each event/frame
}
```

See the [`ParserEvent`] docs for details on the type of `kind` and `data`.

### Async API

[API docs](https://blackbox-log.github.io/blackbox-log-ts/modules/async.html)

```javascript
import { AsyncParser, getWasm, worker } from 'blackbox-log';
// Initialize the parser with the inlined WebAssembly module & worker
const parser = await Parser.init(getWasm(), worker);

// Or:

import AsyncParser from 'blackbox-log/async';
import wasmUrl from 'blackbox-log/wasm?url'; // This is for vite; check your bundler docs
import workerUrl from 'blackbox-log/wasm?url';
const parser = await AsyncParser.init(wasmUrl, workerUrl);

// ---

const rawFile = new File(); // From a file input on the web, the filesystem in Node, etc
const buffer = await rawFile.arrayBuffer();

const file = await parser.loadFile(buffer);
const logCount = await file.logCount;
const log = 0;

const headers = await file.parseHeaders(log); // Parse just the headers of the first log
const fwKind = await headers.firmwareKind;
const fwVersion = await headers.firmwareVersion;
const craft = await headers.craftName;
console.log(
	`Log ${log + 1} of ${logCount + 1}: ${fwKind} v${fwVersion}`.concat(
		craft ? ` named '${craft}'` : '',
	),
);

const data = await headers.getDataParser();
for await (const { kind, data } of data) {
	// Handle each event/frame
}
```

See the [`ParserEvent`] docs for details on the type of `kind` and `data`.

## Contributing

> **Note**: This library does not itself handle any of the parsing. It is just a wrapper for the
> [Rust library of the same name][rust repo]. Most bug reports and features likely belong there.

All contributions are welcome. Feel free to open bug reports and create pull requests at the [GitHub
repository][repo].

As this project is a mix of Rust & TypeScript, ideally contributors will have both set up.
Alternatively, download a pre-built `blackbox-log.wasm` from
[GitHub actions](https://github.com/blackbox-log/blackbox-log-ts/actions/workflows/ci.yaml) and
place it in `src/`.

[repo]: https://github.com/blackbox-log/blackbox-log-ts
[docs]: https://blackbox-log.github.io/blackbox-log-ts/
[rust repo]: https://github.com/blackbox-log/blackbox-log
[rust docs]: https://docs.rs/blackbox-log/latest/blackbox_log/
[betaflight]: https://betaflight.com
[inav]: https://github.com/iNavFlight/inav
[`parserevent`]: https://blackbox-log.github.io/blackbox-log-ts/types/main.ParserEvent.html
[conditional exports]: https://nodejs.org/api/packages.html#packages_conditional_exports
[ts 4.7]:
	https://www.typescriptlang.org/docs/handbook/release-notes/typescript-4-7.html#packagejson-exports-imports-and-self-referencing
[ts 5.0]:
	https://www.typescriptlang.org/docs/handbook/release-notes/typescript-5-0.html#--moduleresolution-bundler
