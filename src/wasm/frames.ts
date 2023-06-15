import { makeGetSlice } from './slice';
import { getStr } from './str';
import { Unit } from '../units';

import type { WasmStr } from './str';

export const enum FrameKind {
	Main = 0,
	Slow = 1,
	Gps = 2,
}

export type FieldDef = { signed: boolean; unit: Unit };
const fieldDefLength = 3;
export const getFieldDefs = makeGetSlice<[string, FieldDef], [Uint32Array, Uint8Array]>(
	(buffer, ptr, len) => {
		const data32 = new Uint32Array(buffer, ptr, len * fieldDefLength);
		const data8 = new Uint8Array(buffer, ptr, len * fieldDefLength * 4);
		return [data32, data8];
	},
	([data32, data8], field, wasm) => {
		const start32 = field * fieldDefLength;
		const name = getStr([data32[start32], data32[start32 + 1]] as WasmStr, wasm);

		const start8 = start32 * 4 + 8;
		const signed = data8[start8] !== 0;
		const rawUnit = data8[start8 + 1];
		const unit = rawUnit in Unit ? rawUnit : Unit.Unitless;

		return [name, { signed, unit }];
	},
);
