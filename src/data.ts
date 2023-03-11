import { Temporal } from 'temporal-polyfill';

import { unreachable } from './utils';
import { WasmPointer } from './wasm';

import type { Headers, InternalFrameDef } from './headers';
import type { WasmExports, WasmObject } from './wasm';

export type ParserEvent =
	| { readonly kind: ParserEventKind.Event; readonly data: undefined }
	| { readonly kind: ParserEventKind.MainFrame; readonly data: MainFrame }
	| { readonly kind: ParserEventKind.SlowFrame; readonly data: SlowFrame }
	| { readonly kind: ParserEventKind.GpsFrame; readonly data: GpsFrame };

export enum ParserEventKind {
	Event = 'event',
	MainFrame = 'main',
	SlowFrame = 'slow',
	GpsFrame = 'gps',
}

export type FrameFields = ReadonlyMap<string, number>;

export type MainFrame = {
	readonly time: Temporal.Duration;
	readonly fields: FrameFields;
};

export type SlowFrame = {
	readonly fields: FrameFields;
};

export type GpsFrame = {
	readonly time: Temporal.Duration;
	readonly fields: FrameFields;
};

export type Stats = {
	readonly counts: {
		readonly event: number;
		readonly main: number;
		readonly slow: number;
		readonly gps: number;
		readonly gpsHome: number;
	};
};

export class DataParser implements WasmObject, Iterable<ParserEvent>, Iterator<ParserEvent> {
	readonly #wasm: WasmExports;
	readonly #ptr: WasmPointer;
	readonly #headers: Headers;
	readonly #parserEventPtr: number;
	readonly #mainFrameDef: InternalFrameDef;
	readonly #slowFrameDef: InternalFrameDef;
	readonly #gpsFrameDef: InternalFrameDef;
	#done = false;

	constructor(
		wasm: WasmExports,
		headers: Headers,
		ptr: number,
		frameDefs: { main: InternalFrameDef; slow: InternalFrameDef; gps: InternalFrameDef },
	) {
		this.#wasm = wasm;
		this.#headers = headers;
		this.#ptr = new WasmPointer(ptr, wasm.data_free);
		this.#parserEventPtr = wasm.data_resultPtr(ptr);
		this.#mainFrameDef = frameDefs.main;
		this.#slowFrameDef = frameDefs.slow;
		this.#gpsFrameDef = frameDefs.gps;
	}

	free() {
		this.#ptr.free();
	}

	get isAlive(): boolean {
		return this.#ptr.isAlive;
	}

	get headers(): Headers {
		return this.#headers;
	}

	stats(): Stats {
		const [event, main, slow, gps, gpsHome] = this.#wasm.data_counts(this.#ptr.ptr);
		return {
			counts: {
				event,
				main,
				slow,
				gps,
				gpsHome,
			},
		};
	}

	[Symbol.iterator]() {
		return this;
	}

	get done(): boolean {
		return this.#done;
	}

	next(): IteratorResult<ParserEvent> {
		if (this.#done) {
			return {
				done: true,
				value: undefined,
			};
		}

		this.#wasm.data_next(this.#ptr.ptr);
		const event = this.#getParserEvent();

		if (event === undefined) {
			this.#done = true;
			return {
				done: true,
				value: undefined,
			};
		}

		return {
			done: false,
			value: event,
		};
	}

	#getParserEvent(): ParserEvent | undefined {
		const bytes = new Uint8Array(this.#wasm.memory.buffer, this.#parserEventPtr);

		const kind = getParserEventKind(bytes[0]);
		if (kind === undefined) {
			return;
		}

		const dataStart = this.#parserEventPtr + 4;

		switch (kind) {
			case ParserEventKind.Event:
				return { kind, data: undefined };

			case ParserEventKind.MainFrame:
				return {
					kind,
					data: getMainData(this.#wasm.memory, dataStart, this.#mainFrameDef),
				};

			case ParserEventKind.SlowFrame:
				return {
					kind,
					data: getSlowData(this.#wasm.memory, dataStart, this.#slowFrameDef),
				};

			case ParserEventKind.GpsFrame:
				return {
					kind,
					data: getGpsData(this.#wasm.memory, dataStart, this.#gpsFrameDef),
				};

			default:
				unreachable(kind);
		}
	}
}

function getParserEventKind(raw: number): ParserEventKind | undefined {
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

function getMainData(memory: WebAssembly.Memory, start: number, def: InternalFrameDef): MainFrame {
	const fields = getFields(memory, start, def);
	start += fieldsByteLen;

	const time = getDuration(memory, start);

	return {
		time,
		fields,
	};
}

function getSlowData(memory: WebAssembly.Memory, start: number, def: InternalFrameDef) {
	const fields = getFields(memory, start, def);
	return { fields };
}

function getGpsData(memory: WebAssembly.Memory, start: number, def: InternalFrameDef): GpsFrame {
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
