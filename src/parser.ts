import { File } from './file';
import { Wasm } from './wasm';

import type { WasmInit } from './wasm';

export class Parser {
	static async init(init: WasmInit): Promise<Parser> {
		const wasm = await Wasm.init(init);
		return new Parser(wasm);
	}

	readonly #wasm;

	constructor(wasm: Wasm) {
		this.#wasm = wasm;
	}

	loadFile(data: Uint8Array): File {
		return new File(this.#wasm, data);
	}
}
