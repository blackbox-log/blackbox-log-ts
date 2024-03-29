import { LogHeaders } from './headers';

import type { ManagedPointer, Wasm, WasmObject } from './wasm';

export class LogFile implements WasmObject {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<LogFile>;

	#headers: Array<WeakRef<LogHeaders>> = [];

	/** @internal */
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

	parseHeaders(log: number): LogHeaders | undefined {
		if (log >= this.logCount) {
			return;
		}

		if (log in this.#headers && this.#headers[log].deref()?.isAlive) {
			return this.#headers[log].deref();
		}

		const headers = new LogHeaders(this.#wasm, this.#ptr.ptr, log);
		this.#headers[log] = new WeakRef(headers);
		return headers;
	}

	get memorySize(): number {
		return this.#wasm.memorySize();
	}
}
