import { Temporal } from 'temporal-polyfill';

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
	const fields = getFields(memory, start, def);
	start += fieldsByteLen;

	const time = getDuration(memory, start);

	return {
		time,
		fields,
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
	const fields = getFields(memory, start, def);
	start += fieldsByteLen;

	return {
		time: getDuration(memory, start + 4),
		fields,
	};
}

function getDuration(memory: WebAssembly.Memory, start: number): Temporal.Duration {
	const u16s = new Uint16Array(memory.buffer, start, 2);
	const [microseconds, milliseconds] = u16s;

	const u8s = new Uint8Array(memory.buffer, start + 4, 3);
	const [seconds, minutes, hours] = u8s;

	return Temporal.Duration.from({
		microseconds,
		milliseconds,
		seconds,
		minutes,
		hours,
	});
}

const fieldsByteLen = 8;
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
