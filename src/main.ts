import encodedWasm from './blackbox-log.wasm?inline';
import { Parser } from './parser';
import { Wasm } from './wasm';

export * from './common';

export class SimpleParser extends Parser {
	static async init(): Promise<SimpleParser> {
		const decoded = atob(encodedWasm);

		const bytes = new Uint8Array(decoded.length);
		for (let i = 0; i < decoded.length; i++) {
			bytes[i] = decoded.charCodeAt(i);
		}

		const wasmModule = await WebAssembly.compile(bytes);
		const wasm = await Wasm.init(wasmModule);
		return new SimpleParser(wasm);
	}

	private constructor(wasm: Wasm) {
		if (!(wasm instanceof Wasm)) {
			throw new Error('create a SimpleParser using its init() method, not new');
		}

		super(wasm);
	}
}
