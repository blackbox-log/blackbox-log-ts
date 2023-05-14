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

This package uses [conditional exports]. To make use of the included types, you will need
`"moduleResolution": "nodenext"` in your `tsconfig.json` and at least TypeScript [version
4.7][ts 4.7]. It will also work with the new `"moduleResolution": "bundler"` introduced in [TS 5.0].

## Usage

See [the full API docs][docs] built from the latest `main` branch. The API is designed to parallel
[the Rust API][rust docs].

The default export (ie importing from `blackbox-log`) provides the full API along with the inlined
WebAssembly. Alternatively, importing from `blackbox-log/slim` may reduce bundle size, but does
require the WebAssembly file (`blackbox-log/wasm`) to be loaded separately and served with the
`application/wasm` mime type.

### Example

```javascript
import { Parser, getWasm } from 'blackbox-log';

// Initialize the parser with the inlined WebAssembly module
const parser = await Parser.init(getWasm());

// Or:

import { Parser } from 'blackbox-log/slim';
import wasmUrl from 'blackbox-log/wasm?url'; // This is for vite; check your bundler docs

// Download and initialize from the url
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
