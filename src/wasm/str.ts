import { makeGetSlice } from './slice';

import type { WasmExports } from '.';
import type { WasmSlice } from './slice';

declare const strByte: unique symbol;
export type OptionalWasmStr = WasmSlice<typeof strByte>;

declare const notNull: unique symbol;
export type WasmStr = OptionalWasmStr & { [notNull]: true };

let cachedDecoder: undefined | TextDecoder;
function getDecoder(): TextDecoder {
	if (cachedDecoder === undefined) {
		cachedDecoder = new TextDecoder('utf-8', {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			ignoreBOM: true,
			fatal: true,
		});
	}

	return cachedDecoder;
}

export function getStr([len, ptr]: WasmStr, wasm: WasmExports): string {
	if (ptr === 0) {
		throw new Error('null string pointer');
	}

	const bytes = new Uint8Array(wasm.memory.buffer, ptr, len);
	return getDecoder().decode(bytes);
}

export function getOptionalStr([len, ptr]: OptionalWasmStr, wasm: WasmExports): string | undefined {
	if (ptr === 0) {
		return undefined;
	}

	return getStr([len, ptr] as WasmStr, wasm);
}

export const getStrSlice = makeGetSlice<string, Uint32Array>(
	(buffer, ptr, len) => new Uint32Array(buffer, ptr, len * 2),
	(data, i, wasm) => getStr([data[i * 2], data[i * 2 + 1]] as WasmStr, wasm),
	(wasm, [len, ptr]) => {
		wasm.sliceStr_free(len, ptr);
	},
);
