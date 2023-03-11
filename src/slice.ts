import { getWasmStr } from './str';

import type { WasmExports } from './wasm';

export type WasmSlice = [len: number, ptr: number];

export const getWasmSliceStr = makeGetSlice(
	(buffer, ptr, len) => new Uint32Array(buffer, ptr, len * 2),
	(data, i, wasm) => getWasmStr([data[i * 2], data[i * 2 + 1]], wasm),
	(wasm, slice) => {
		wasm.sliceStr_free(...slice);
	},
);

export function makeGetSlice<T, A>(
	getArray: (buffer: ArrayBuffer, ptr: number, len: number) => A,
	getElement: (array: A, i: number, wasm: WasmExports) => T,
	free?: (wasm: WasmExports, slice: WasmSlice) => void,
): (slice: WasmSlice, wasm: WasmExports) => Generator<T, void, void> {
	return function* (slice: WasmSlice, wasm: WasmExports) {
		const [len, ptr] = slice;
		if (len > 0 && ptr !== 0) {
			const array = getArray(wasm.memory.buffer, ptr, len);
			for (let i = 0; i < len; i++) {
				yield getElement(array, i, wasm);
			}

			free?.(wasm, slice);
		}
	};
}
