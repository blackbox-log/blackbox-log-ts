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

export function getMainData(memory: DataView, start: number, def: InternalFrameDef): MainFrame {
	return {
		time: getTime(memory, start),
		fields: getFields(memory, start + 8, def),
	};
}

export function getSlowData(memory: DataView, start: number, def: InternalFrameDef): SlowFrame {
	const fields = getFields(memory, start, def);
	return { fields };
}

export function getGpsData(memory: DataView, start: number, def: InternalFrameDef): GpsFrame {
	return {
		time: getTime(memory, start),
		fields: getFields(memory, start + 8, def),
	};
}

function getTime(memory: DataView, start: number): number {
	return memory.getFloat64(start, true);
}

function getFields(memory: DataView, start: number, def: InternalFrameDef): FrameFields {
	const len = memory.getUint32(start, true);
	const ptr = memory.getUint32(start + 4, true);

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
