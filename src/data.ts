import type { LogHeaders } from './headers';
import type { ManagedPointer, Wasm, WasmObject } from './wasm';

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
	/** Frame time in fractional seconds */
	time: number;
	fields: FrameFields;
};

export type SlowFrame = {
	fields: FrameFields;
};

export type GpsFrame = {
	/** Frame time in fractional seconds */
	time: number;
	fields: FrameFields;
};

export type Stats = {
	/** The number of valid frames found of each type */
	counts: {
		event: number;
		main: number;
		slow: number;
		gps: number;
		gpsHome: number;
	};
	/** The approximate percentage of the log data parsed so far as a number in the range `[0,1]`. */
	progress: number;
};

export class DataParser implements WasmObject, IterableIterator<ParserEvent> {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<DataParser>;
	readonly #headers: LogHeaders;
	#done = false;

	/** @internal */
	constructor(wasm: Wasm, ptr: ManagedPointer<DataParser>, headers: LogHeaders) {
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

	get headers(): LogHeaders {
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
