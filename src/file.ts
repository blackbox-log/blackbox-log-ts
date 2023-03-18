import { Headers } from './headers';

import type { ManagedPointer, Wasm, WasmObject } from './wasm';

export class File implements WasmObject {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<File>;

	#headers: Array<WeakRef<Headers>> = [];

	constructor(wasm: Wasm, data: Uint8Array) {
		this.#wasm = wasm;
		this.#ptr = wasm.newFile(data);
	}

	free() {
		for (const headers of this.#headers) {
			headers.deref()?.free();
		}

		this.#ptr.free();
	}

	get isAlive(): boolean {
		return this.#ptr.isAlive;
	}

	get logCount(): number {
		return this.#wasm.logCount(this.#ptr.ptr);
	}

	parseHeaders(index: number): Headers | undefined {
		if (index >= this.logCount) {
			return undefined;
		}

		if (index in this.#headers && this.#headers[index].deref()?.isAlive) {
			return this.#headers[index].deref();
		}

		const headers = new Headers(this.#wasm, this.#ptr.ptr, index);
		this.#headers[index] = new WeakRef(headers);
		return headers;
	}

	get memorySize(): number {
		return this.#wasm.memorySize;
	}
}
