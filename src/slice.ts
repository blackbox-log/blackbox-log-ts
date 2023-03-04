import { getWasmStr } from './str';

import type { WasmExports } from './wasm';

export type WasmSlice = [len: number, ptr: number];

export function* getWasmSliceStr([len, ptr]: WasmSlice, wasm: WasmExports): Generator<string> {
	if (len > 0) {
		const data = new Uint32Array(wasm.memory.buffer, ptr, len * 2);
		for (let i = 0; i < len * 2; i += 2) {
			yield getWasmStr([data[i], data[i + 1]], wasm);
		}
	}

	wasm.sliceStr_free(len, ptr);
}
