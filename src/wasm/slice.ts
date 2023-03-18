import type { WasmExports } from '.';

export type WasmSlice<T> = [len: number, ptr: number] & { _of: T };

export function makeGetSlice<T, A>(
	getArray: (buffer: ArrayBuffer, ptr: number, len: number) => A,
	getElement: (array: A, i: number, wasm: WasmExports) => T,
	free?: (wasm: WasmExports, slice: WasmSlice<T>) => void,
): (slice: WasmSlice<T>, wasm: WasmExports) => Generator<T, void, void> {
	return function* (slice, wasm) {
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
