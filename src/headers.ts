import { Temporal } from 'temporal-polyfill';
import { Memoize as memoize } from 'typescript-memoize';

import { DataParser } from './data';
import { getWasmSliceStr } from './slice';
import { getOptionalWasmStr, getWasmStr } from './str';
import { Unit } from './units';
import { freezeMap, freezeSet } from './utils';
import { WasmPointer } from './wasm';

import type { WasmExports, WasmObject } from './wasm';

export type FrameDef = Map<string, { unit: Unit }>;
export type InternalFrameDef = Map<string, { unit: Unit; signed: boolean }>;

export class Headers implements WasmObject {
	readonly #wasm: WasmExports;
	readonly #ptr: WasmPointer;

	#parsers: Array<WeakRef<DataParser>> = [];

	#mainFrameDef: InternalFrameDef | undefined;
	#slowFrameDef: InternalFrameDef | undefined;
	#gpsFrameDef: InternalFrameDef | undefined;

	constructor(wasm: WasmExports, file: number, log: number) {
		this.#wasm = wasm;
		const ptr = this.#wasm.file_getHeaders(file, log);
		this.#ptr = new WasmPointer(ptr, wasm.headers_free);
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
		const ptr = this.#wasm.headers_getDataParser(this.#ptr.ptr);

		const parser = new DataParser(this.#wasm, this, ptr, {
			main: this.#getMainFrameDef(),
			slow: this.#getSlowFrameDef(),
			gps: this.#getGpsFrameDef(),
		});

		this.#parsers.push(new WeakRef(parser));
		return parser;
	}

	#getMainFrameDef(): InternalFrameDef {
		if (this.#mainFrameDef === undefined) {
			const ptr = this.#wasm.headers_mainDef(this.#ptr.ptr);
			this.#mainFrameDef = getFrameDef(ptr, this.#wasm);
		}

		return this.#mainFrameDef;
	}

	get mainFrameDef(): FrameDef {
		return this.#getMainFrameDef();
	}

	#getSlowFrameDef(): InternalFrameDef {
		if (this.#slowFrameDef === undefined) {
			const ptr = this.#wasm.headers_slowDef(this.#ptr.ptr);
			this.#slowFrameDef = getFrameDef(ptr, this.#wasm);
		}

		return this.#slowFrameDef;
	}

	get slowFrameDef(): FrameDef {
		return this.#getSlowFrameDef();
	}

	#getGpsFrameDef(): InternalFrameDef {
		if (this.#gpsFrameDef === undefined) {
			const ptr = this.#wasm.headers_gpsDef(this.#ptr.ptr);
			this.#gpsFrameDef = getFrameDef(ptr, this.#wasm);
		}

		return this.#gpsFrameDef;
	}

	get gpsFrameDef(): FrameDef {
		return this.#getGpsFrameDef();
	}

	@memoize()
	get firmwareRevision(): string {
		const revision = this.#wasm.headers_firmwareRevision(this.#ptr.ptr);
		return getWasmStr(revision, this.#wasm);
	}

	@memoize()
	get firmwareKind(): FirmwareKind {
		const kind = this.#wasm.headers_firmwareKind(this.#ptr.ptr);
		switch (kind) {
			case 0:
				return FirmwareKind.Betaflight;
			case 1:
				return FirmwareKind.Inav;
			default:
				throw new Error(`invalid FirmwareKind: ${kind}`);
		}
	}

	@memoize()
	get firmwareDate(): Temporal.PlainDateTime | string | undefined {
		const [discriminant, ...rest] = this.#wasm.headers_firmwareDate(this.#ptr.ptr);
		switch (discriminant) {
			case 1:
				return new Temporal.PlainDateTime(...rest);
			case 2:
				return getWasmStr([rest[0], rest[1]], this.#wasm);
			// Only ever 0:
			default:
				return undefined;
		}
	}

	@memoize()
	get firmwareVersion(): Version {
		const version = this.#wasm.headers_firmwareVersion(this.#ptr.ptr);
		return new Version(...version);
	}

	@memoize()
	get boardInfo(): string | undefined {
		const name = this.#wasm.headers_boardInfo(this.#ptr.ptr);
		return getOptionalWasmStr(name, this.#wasm);
	}

	@memoize()
	get craftName(): string | undefined {
		const name = this.#wasm.headers_craftName(this.#ptr.ptr);
		return getOptionalWasmStr(name, this.#wasm);
	}

	@memoize()
	get debugMode(): string {
		const raw = this.#wasm.headers_debugMode(this.#ptr.ptr);
		return getWasmStr(raw, this.#wasm);
	}

	@memoize()
	get disabledFields(): Set<string> {
		const slice = this.#wasm.headers_disabledFields(this.#ptr.ptr);
		const fields = new Set(getWasmSliceStr(slice, this.#wasm));
		return freezeSet(fields);
	}

	@memoize()
	get features(): Set<string> {
		const slice = this.#wasm.headers_features(this.#ptr.ptr);
		const fields = new Set(getWasmSliceStr(slice, this.#wasm));
		return freezeSet(fields);
	}

	@memoize()
	get pwmProtocol(): string {
		const raw = this.#wasm.headers_pwmProtocol(this.#ptr.ptr);
		return getWasmStr(raw, this.#wasm);
	}

	@memoize()
	get unknown(): Map<string, string> {
		const [len, ptr] = this.#wasm.headers_unknown(this.#ptr.ptr);
		const map = new Map();

		if (len > 0) {
			const data = new Uint32Array(this.#wasm.memory.buffer, ptr, len * 4);
			for (let i = 0; i < len * 4; i += 4) {
				const key = getWasmStr([data[i], data[i + 1]], this.#wasm);
				const value = getWasmStr([data[i + 2], data[i + 3]], this.#wasm);
				map.set(key, value);
			}
		}

		this.#wasm.unknownHeaders_free(len, ptr);
		return freezeMap(map);
	}
}

function getFrameDef(ptr: number, wasm: WasmExports): InternalFrameDef {
	const fieldDefLength = 3;

	const [len, fields] = new Uint32Array(wasm.memory.buffer, ptr, 2);

	const def: InternalFrameDef = new Map();
	if (len !== 0 && fields !== 0) {
		const data32 = new Uint32Array(wasm.memory.buffer, fields, len * fieldDefLength);
		const data8 = new Uint8Array(wasm.memory.buffer, fields, len * fieldDefLength * 4);

		for (let field = 0; field < len; field++) {
			const start32 = field * fieldDefLength;

			const name = getWasmStr([data32[start32], data32[start32 + 1]], wasm);

			const start8 = start32 * 4 + 8;
			const signed = data8[start8] !== 0;
			const unit = data8[start8 + 1];

			def.set(name, {
				unit: unit in Unit ? unit : Unit.Unitless,
				signed,
			});
		}
	}

	wasm.frameDef_free(ptr);

	return def;
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
