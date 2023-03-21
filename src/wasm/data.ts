import { ParserEventKind } from '../data';

import type { FrameFields, GpsFrame, MainFrame, SlowFrame } from '../data';
import type { InternalFrameDef } from '../headers';

export function getParserEventKind(raw: number): ParserEventKind | undefined {
	switch (raw) {
		case 0:
			return;

		case 1:
			return ParserEventKind.Event;
		case 2:
			return ParserEventKind.MainFrame;
		case 3:
			return ParserEventKind.SlowFrame;
		case 4:
			return ParserEventKind.GpsFrame;

		default:
			throw new Error(`invalid ParserEventKind: ${raw}`);
	}
}

export function getMainData(
	memory: WebAssembly.Memory,
	start: number,
	def: InternalFrameDef,
): MainFrame {
	return {
		time: getTime(memory, start),
		fields: getFields(memory, start + 8, def),
	};
}

export function getSlowData(
	memory: WebAssembly.Memory,
	start: number,
	def: InternalFrameDef,
): SlowFrame {
	const fields = getFields(memory, start, def);
	return { fields };
}

export function getGpsData(
	memory: WebAssembly.Memory,
	start: number,
	def: InternalFrameDef,
): GpsFrame {
	return {
		time: getTime(memory, start),
		fields: getFields(memory, start + 8, def),
	};
}

function getTime(memory: WebAssembly.Memory, start: number): number {
	const f64s = new Float64Array(memory.buffer, start, 1);
	return f64s[0];
}

function getFields(memory: WebAssembly.Memory, start: number, def: InternalFrameDef): FrameFields {
	const [len, ptr] = new Uint32Array(memory.buffer, start, 2);

	if (len === 0 || ptr === 0) {
		return new Map();
	}

	if (len !== def.size) {
		throw new Error(
			`frame length (${len}) does not match the definition's length (${def.size})`,
		);
	}

	const unsigned = new Uint32Array(memory.buffer, ptr, len);
	const signed = new Int32Array(memory.buffer, ptr, len);

	const fields = new Map();
	let i = 0;
	for (const [field, fieldDef] of def) {
		fields.set(field, (fieldDef.signed ? signed : unsigned)[i]);
		i += 1;
	}

	return fields;
}
