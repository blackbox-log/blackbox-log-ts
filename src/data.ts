import type { Headers } from './headers';
import type { ManagedPointer, Wasm, WasmObject } from './wasm';
import type { Temporal } from 'temporal-polyfill';

export type ParserEvent =
	| { kind: ParserEventKind.Event; data: undefined }
	| { kind: ParserEventKind.MainFrame; data: MainFrame }
	| { kind: ParserEventKind.SlowFrame; data: SlowFrame }
	| { kind: ParserEventKind.GpsFrame; data: GpsFrame };

export enum ParserEventKind {
	Event = 'event',
	MainFrame = 'main',
	SlowFrame = 'slow',
	GpsFrame = 'gps',
}

export type FrameFields = ReadonlyMap<string, number>;

export type MainFrame = {
	time: Temporal.Duration;
	fields: FrameFields;
};

export type SlowFrame = {
	fields: FrameFields;
};

export type GpsFrame = {
	time: Temporal.Duration;
	fields: FrameFields;
};

export type Stats = {
	counts: {
		event: number;
		main: number;
		slow: number;
		gps: number;
		gpsHome: number;
	};
};

export class DataParser implements WasmObject, IterableIterator<ParserEvent> {
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

	stats(): Readonly<Stats> {
		return this.#wasm.dataStats(this.#ptr.ptr);
	}

	[Symbol.iterator]() {
		return this;
	}

	get done(): boolean {
		return this.#done;
	}

	next(): IteratorResult<Readonly<ParserEvent>> {
		if (this.#done) {
			return { done: true, value: undefined };
		}

		const value = this.#wasm.dataNext(this.#ptr.ptr);

		if (value === undefined) {
			this.#done = true;
			return { done: true, value: undefined };
		}

		return { done: false, value };
	}
}
