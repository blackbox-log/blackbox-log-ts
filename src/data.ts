import type { Headers } from './headers';
import type { ManagedPointer, Wasm, WasmObject } from './wasm';
import type { Temporal } from 'temporal-polyfill';

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
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<DataParser>;
	readonly #headers: Headers;
	#done = false;

	constructor(wasm: Wasm, ptr: ManagedPointer<DataParser>, headers: Headers) {
		this.#wasm = wasm;
		this.#ptr = ptr;
		this.#headers = headers;
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
		return this.#wasm.dataStats(this.#ptr.ptr);
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

		const event = this.#wasm.dataNext(this.#ptr.ptr);

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
}
