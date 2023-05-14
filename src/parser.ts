import { LogFile } from './file';
import { Wasm } from './wasm';

import type { WasmInit } from './wasm';

export class Parser {
	static async init(init: WasmInit): Promise<Parser> {
		const wasm = await Wasm.init(init);
		return new Parser(wasm);
	}

	readonly #wasm;

	/** @internal */
	constructor(wasm: Wasm) {
		this.#wasm = wasm;
	}

	loadFile(data: Uint8Array | ArrayBufferLike): LogFile {
		const dataArr = data instanceof Uint8Array ? data : new Uint8Array(data);
		return new LogFile(this.#wasm, dataArr);
	}
}
