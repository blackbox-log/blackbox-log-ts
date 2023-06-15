import type { FrameDef, LogHeaders } from './headers';
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

export type DataParserOptions = {
	/**
	 * If present, each property sets the list of optional fields to be included in the `fields` map
	 * for the corresponding frame type. Any omitted properties will include all fields.
	 *
	 * @example
	 * ```ts
	 * const options = {
	 *     fields: {
	 *         // Only include `rcCommand[0]` through `rcCommand[3]` in main frames
	 *         main: ['rcCommand'],
	 *         // Include all fields in slow frames
	 *         slow: undefined,
	 *         // Do not include any optional fields in gps frames
	 *         gps: [],
	 *     },
	 * };
	 * ```
	 */
	fields?: {
		main?: string[];
		slow?: string[];
		gps?: string[];
	};
};

export class DataParser implements WasmObject, IterableIterator<ParserEvent> {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<DataParser>;
	readonly #headers: LogHeaders;
	#done = false;

	#mainFrameDef: FrameDef;
	#slowFrameDef: FrameDef;
	#gpsFrameDef: FrameDef;

	/** @internal */
	constructor(wasm: Wasm, ptr: ManagedPointer<DataParser>, headers: LogHeaders) {
		this.#wasm = wasm;
		this.#ptr = ptr;
		this.#headers = headers;

		const frameDefs = wasm.dataFrameDefs(ptr.ptr)!;
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

	get headers(): LogHeaders {
		return this.#headers;
	}

	/** Main frame definition after any filters */
	get mainFrameDef(): FrameDef {
		return this.#mainFrameDef;
	}

	/** Slow frame definition after any filters */
	get slowFrameDef(): FrameDef {
		return this.#slowFrameDef;
	}

	/** GPS frame definition after any filters */
	get gpsFrameDef(): FrameDef {
		return this.#gpsFrameDef;
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
