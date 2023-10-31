import { Memoize as memoize } from 'typescript-memoize';

import { DataParser } from './data';
import { FrameKind } from './wasm/frames';

import type { DataParserOptions } from './data';
import type { LogFile } from './file';
import type { Unit } from './units';
import type { ManagedPointer, RawPointer, Wasm, WasmObject } from './wasm';

export type FrameDef = ReadonlyMap<string, { unit: Unit }>;
/** @internal */
export type InternalFrameDef = ReadonlyMap<string, { unit: Unit; signed: boolean }>;

export enum FirmwareKind {
	Betaflight = 'Betaflight',
	Inav = 'INAV',
}

export class Version {
	constructor(
		public major: number,
		public minor: number,
		public patch: number,
	) {}

	toString(): string {
		return `${this.major}.${this.minor}.${this.patch}`;
	}
}

export class LogHeaders implements WasmObject {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<LogHeaders>;

	readonly #parsers: Array<WeakRef<DataParser>> = [];

	#_mainFrameDef: InternalFrameDef | undefined;
	#_slowFrameDef: InternalFrameDef | undefined;
	#_gpsFrameDef: InternalFrameDef | undefined;

	/** @internal */
	constructor(wasm: Wasm, file: RawPointer<LogFile>, log: number) {
		this.#wasm = wasm;
		this.#ptr = wasm.newHeaders(file, log);
	}

	free() {
		for (const parser of this.#parsers) {
			parser.deref()?.free();
		}

		this.#ptr.free();
	}

	get isAlive(): boolean {
		return this.#ptr.isAlive;
	}

	getDataParser(options: DataParserOptions = {}): DataParser {
		const [ptr, info] = this.#wasm.newData(this.#ptr.ptr, options);
		const parser = new DataParser(this.#wasm, ptr, info, this);

		this.#parsers.push(new WeakRef(parser));
		return parser;
	}

	#getMainFrameDef(): InternalFrameDef {
		if (this.#_mainFrameDef === undefined) {
			this.#_mainFrameDef = this.#wasm.frameDef('headers', this.#ptr.ptr, FrameKind.Main);
		}

		return this.#_mainFrameDef;
	}

	get mainFrameDef(): FrameDef {
		return this.#getMainFrameDef();
	}

	#getSlowFrameDef(): InternalFrameDef {
		if (this.#_slowFrameDef === undefined) {
			this.#_slowFrameDef = this.#wasm.frameDef('headers', this.#ptr.ptr, FrameKind.Slow);
		}

		return this.#_slowFrameDef;
	}

	get slowFrameDef(): FrameDef {
		return this.#getSlowFrameDef();
	}

	#getGpsFrameDef(): InternalFrameDef {
		if (this.#_gpsFrameDef === undefined) {
			this.#_gpsFrameDef = this.#wasm.frameDef('headers', this.#ptr.ptr, FrameKind.Gps);
		}

		return this.#_gpsFrameDef;
	}

	get gpsFrameDef(): FrameDef {
		return this.#getGpsFrameDef();
	}

	@memoize()
	get firmwareRevision(): string {
		return this.#wasm.strHeader(this.#ptr.ptr, 'firmwareRevision');
	}

	@memoize()
	get firmwareKind(): FirmwareKind {
		return this.#wasm.firmwareKind(this.#ptr.ptr);
	}

	@memoize()
	get firmwareDate(): Date | string | undefined {
		return this.#wasm.firmwareDate(this.#ptr.ptr);
	}

	@memoize()
	get firmwareVersion(): Version {
		return this.#wasm.firmwareVersion(this.#ptr.ptr);
	}

	@memoize()
	get boardInfo(): string | undefined {
		return this.#wasm.strOptionHeader(this.#ptr.ptr, 'boardInfo');
	}

	@memoize()
	get craftName(): string | undefined {
		return this.#wasm.strOptionHeader(this.#ptr.ptr, 'craftName');
	}

	@memoize()
	get debugMode(): string {
		return this.#wasm.strHeader(this.#ptr.ptr, 'debugMode');
	}

	@memoize()
	get disabledFields(): ReadonlySet<string> {
		return this.#wasm.strSetHeader(this.#ptr.ptr, 'disabledFields');
	}

	@memoize()
	get features(): ReadonlySet<string> {
		return this.#wasm.strSetHeader(this.#ptr.ptr, 'features');
	}

	@memoize()
	get pwmProtocol(): string {
		return this.#wasm.strHeader(this.#ptr.ptr, 'pwmProtocol');
	}

	@memoize()
	get unknown(): ReadonlyMap<string, string> {
		return this.#wasm.unknownHeaders(this.#ptr.ptr);
	}
}
