import { Memoize as memoize } from 'typescript-memoize';

import { DataParser } from './data';

import type { File } from './file';
import type { Unit } from './units';
import type { ManagedPointer, RawPointer, Wasm, WasmObject } from './wasm';
import type { Temporal } from 'temporal-polyfill';

export type FrameDef = ReadonlyMap<string, { unit: Unit }>;
export type InternalFrameDef = ReadonlyMap<string, { unit: Unit; signed: boolean }>;

export class Headers implements WasmObject {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<Headers>;

	#parsers: Array<WeakRef<DataParser>> = [];

	#mainFrameDef: InternalFrameDef | undefined;
	#slowFrameDef: InternalFrameDef | undefined;
	#gpsFrameDef: InternalFrameDef | undefined;

	constructor(wasm: Wasm, file: RawPointer<File>, log: number) {
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

	getDataParser(): DataParser {
		const ptr = this.#wasm.newData(this.#ptr.ptr);
		const parser = new DataParser(this.#wasm, ptr, this);

		this.#parsers.push(new WeakRef(parser));
		return parser;
	}

	#getMainFrameDef(): InternalFrameDef {
		if (this.#mainFrameDef === undefined) {
			this.#mainFrameDef = this.#wasm.frameDef(this.#ptr.ptr, 'main');
		}

		return this.#mainFrameDef;
	}

	get mainFrameDef(): FrameDef {
		return this.#getMainFrameDef();
	}

	#getSlowFrameDef(): InternalFrameDef {
		if (this.#slowFrameDef === undefined) {
			this.#slowFrameDef = this.#wasm.frameDef(this.#ptr.ptr, 'slow');
		}

		return this.#slowFrameDef;
	}

	get slowFrameDef(): FrameDef {
		return this.#getSlowFrameDef();
	}

	#getGpsFrameDef(): InternalFrameDef {
		if (this.#gpsFrameDef === undefined) {
			this.#gpsFrameDef = this.#wasm.frameDef(this.#ptr.ptr, 'gps');
		}

		return this.#gpsFrameDef;
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
	get firmwareDate(): Temporal.PlainDateTime | string | undefined {
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

export enum FirmwareKind {
	Betaflight = 'Betaflight',
	Inav = 'INAV',
}

export class Version {
	constructor(public major: number, public minor: number, public patch: number) {}

	toString(): string {
		return `${this.major}.${this.minor}.${this.patch}`;
	}
}
