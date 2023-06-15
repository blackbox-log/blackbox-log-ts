import { makeGetSlice } from './slice';
import { getStr } from './str';

import type { WasmStr } from './str';

export const getUnknownHeaderPairs = makeGetSlice<[string, string], Uint32Array>(
	(buffer, ptr, len) => new Uint32Array(buffer, ptr, len * 4),
	(data, element, wasm) => {
		const i = element * 4;
		const key = getStr([data[i], data[i + 1]] as WasmStr, wasm);
		const value = getStr([data[i + 2], data[i + 3]] as WasmStr, wasm);
		return [key, value];
	},
	(wasm, slice) => {
		wasm.unknownHeaders_free(slice[0], slice[1]);
	},
);
