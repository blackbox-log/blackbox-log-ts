import { Temporal } from 'temporal-polyfill';
import { Memoize as memoize } from 'typescript-memoize';

import { DataParser } from './data';
import { getWasmSliceStr } from './slice';
import { getOptionalWasmStr, getWasmStr } from './str';
import { freezeSet } from './utils';
import { WasmPointer } from './wasm';

import type { WasmExports, WasmObject } from './wasm';

export type FrameDef = FieldDef[];
export type FieldDef = {
	name: string;
	signed: boolean;
};

export class Headers implements WasmObject {
	readonly #wasm: WasmExports;
	readonly #ptr: WasmPointer;

	#parsers: Array<WeakRef<DataParser>> = [];

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
		const parser = new DataParser(this.#wasm, this, ptr);
		this.#parsers.push(new WeakRef(parser));
		return parser;
	}

	@memoize()
	get mainFrameDef(): FrameDef {
		const ptr = this.#wasm.headers_mainDef(this.#ptr.ptr);
		return getFrameDef(ptr, this.#wasm);
	}

	@memoize()
	get slowFrameDef(): FrameDef {
		const ptr = this.#wasm.headers_slowDef(this.#ptr.ptr);
		return getFrameDef(ptr, this.#wasm);
	}

	@memoize()
	get gpsFrameDef(): FrameDef {
		const ptr = this.#wasm.headers_gpsDef(this.#ptr.ptr);
		return getFrameDef(ptr, this.#wasm);
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
}

function getFrameDef(ptr: number, wasm: WasmExports): FrameDef {
	const fieldDefLength = 3;

	const [len, fields] = new Uint32Array(wasm.memory.buffer, ptr, 2);

	const def = [];
	if (len !== 0 && fields !== 0) {
		const data = new Uint32Array(wasm.memory.buffer, fields, len * fieldDefLength);

		for (let field = 0; field < len; field++) {
			const start = field * fieldDefLength;

			def.push({
				name: getWasmStr([data[start], data[start + 1]], wasm),
				signed: data[start + 2] !== 0,
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
