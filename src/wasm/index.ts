import { Temporal } from 'temporal-polyfill';

import * as DataParsers from './data';
import * as HeadersParsers from './headers';
import { ManagedPointer } from './pointers';
import { getOptionalStr, getStr, getStrSlice } from './str';
import { ParserEventKind } from '../data';
import { FirmwareKind, type Headers, type InternalFrameDef, Version } from '../headers';
import { ParseError } from '../parseError';
import { freezeMap, freezeSet, unreachable } from '../utils';

import type { RawPointer } from './pointers';
import type { WasmSlice } from './slice';
import type { OptionalWasmStr, WasmStr } from './str';
import type { DataParser, ParserEvent, Stats } from '../data';
import type { File } from '../file';

export type { RawPointer, ManagedPointer };

export type WasmObject = {
	isAlive: boolean;
	free(): void;
};

export type WasmExports = {
	memory: WebAssembly.Memory;
	set_panic_hook: () => void;

	data_alloc: (length: number) => number;
	slice8_free: (length: number, ptr: number) => void;
	sliceStr_free: (length: number, ptr: number) => void;

	file_free: (ptr: number) => void;
	file_new: (ptr: number, length: number) => number;
	file_logCount: (ptr: number) => number;
	file_getHeaders: (ptr: number, log: number) => number;
	file_getLog: (ptr: number, log: number) => number;

	headers_free: (ptr: number) => void;
	headers_getDataParser: (ptr: number) => number;
	headers_mainDef: (ptr: number) => number;
	headers_slowDef: (ptr: number) => number;
	headers_gpsDef: (ptr: number) => number;
	headers_firmwareRevision: (ptr: number) => WasmStr;
	headers_firmwareKind: (ptr: number) => number;
	headers_firmwareDate: (ptr: number) => [number, number, number, number, number, number, number];
	headers_firmwareVersion: (ptr: number) => [major: number, minor: number, patch: number];
	headers_boardInfo: (ptr: number) => OptionalWasmStr;
	headers_craftName: (ptr: number) => OptionalWasmStr;
	headers_debugMode: (ptr: number) => WasmStr;
	headers_disabledFields: (ptr: number) => WasmSlice<string>;
	headers_features: (ptr: number) => WasmSlice<string>;
	headers_pwmProtocol: (ptr: number) => WasmStr;
	headers_unknown: (ptr: number) => WasmSlice<[string, string]>;

	frameDef_free: (ptr: number) => void;
	unknownHeaders_free: (length: number, ptr: number) => void;

	data_free: (ptr: number) => void;
	data_resultPtr: (ptr: number) => number;
	data_counts: (ptr: number) => [number, number, number, number, number];
	data_next: (ptr: RawPointer<DataParser>) => void;
};

type DataParseInfo = Record<'main' | 'slow' | 'gps', InternalFrameDef> & {
	eventPtr: RawPointer<ParserEvent>;
};

export type WasmInit = string | URL | Request | Response | WebAssembly.Module;

export class Wasm {
	static async init(init: WasmInit): Promise<Wasm> {
		let instance;
		let exports: WasmExports | undefined;

		const imports = {
			main: {
				panic(len: number, ptr: number) {
					if (exports === undefined) {
						console.error('received panic before JS handler was initialized');
						return;
					}

					console.error(getStr([len, ptr] as WasmStr, exports));
				},
				throw(len: number, ptr: number) {
					if (exports === undefined) {
						throw new ParseError('unknown error');
					} else {
						const message = getStr([len, ptr] as WasmStr, exports);
						exports.slice8_free(len, ptr);
						throw new ParseError(message);
					}
				},
			},
		};

		if (init instanceof WebAssembly.Module) {
			instance = new WebAssembly.Instance(init, imports);
		} else {
			const response = init instanceof Response ? init : fetch(init);

			const wasmModule = await WebAssembly.instantiateStreaming(response, imports);
			instance = wasmModule.instance;
		}

		return new Wasm(instance.exports as WasmExports);
	}

	readonly #wasm;
	#dataParserInfo = new Map<RawPointer<DataParser>, DataParseInfo>();

	private constructor(wasm: WasmExports) {
		wasm.set_panic_hook();
		this.#wasm = wasm;
	}

	get memorySize(): number {
		return this.#wasm.memory.buffer.byteLength;
	}

	newFile(data: Uint8Array): ManagedPointer<File> {
		const dataPtr = this.#wasm.data_alloc(data.length);
		if (dataPtr === 0) {
			throw new Error('file allocation failed');
		}

		const buffer = this.#uint8Array(dataPtr, data.length);
		buffer.set(data);

		const filePtr = this.#wasm.file_new(dataPtr, data.length) as RawPointer<File>;
		return new ManagedPointer(filePtr, this.#wasm.file_free);
	}

	logCount(file: RawPointer<File>): number {
		return this.#wasm.file_logCount(file);
	}

	newHeaders(file: RawPointer<File>, log: number): ManagedPointer<Headers> {
		const ptr = this.#wasm.file_getHeaders(file, log) as RawPointer<Headers>;
		return new ManagedPointer(ptr, this.#wasm.headers_free);
	}

	frameDef(headers: RawPointer<Headers>, frame: 'main' | 'slow' | 'gps'): InternalFrameDef {
		const ptr = this.#wasm[`headers_${frame}Def`](headers);
		const [len, fields] = this.#uint32Array(ptr, 2);
		const def = new Map(
			HeadersParsers.getFieldDefs(
				[len, fields] as WasmSlice<[string, HeadersParsers.FieldDef]>,
				this.#wasm,
			),
		);
		this.#wasm.frameDef_free(ptr);
		return freezeMap(def);
	}

	strHeader(
		headers: RawPointer<Headers>,
		header: 'firmwareRevision' | 'debugMode' | 'pwmProtocol',
	): string {
		const str = this.#wasm[`headers_${header}`](headers);
		return getStr(str, this.#wasm);
	}

	strOptionHeader(
		headers: RawPointer<Headers>,
		header: 'boardInfo' | 'craftName',
	): string | undefined {
		const str = this.#wasm[`headers_${header}`](headers);
		return getOptionalStr(str, this.#wasm);
	}

	strSetHeader(
		headers: RawPointer<Headers>,
		header: 'disabledFields' | 'features',
	): ReadonlySet<string> {
		const slice = this.#wasm[`headers_${header}`](headers);
		const fields = new Set(getStrSlice(slice, this.#wasm));
		return freezeSet(fields);
	}

	firmwareKind(headers: RawPointer<Headers>): FirmwareKind {
		const kind = this.#wasm.headers_firmwareKind(headers);
		switch (kind) {
			case 0:
				return FirmwareKind.Betaflight;
			case 1:
				return FirmwareKind.Inav;
			default:
				throw new Error(`invalid FirmwareKind: ${kind}`);
		}
	}

	firmwareDate(headers: RawPointer<Headers>): Temporal.PlainDateTime | string | undefined {
		const [discriminant, ...rest] = this.#wasm.headers_firmwareDate(headers);
		switch (discriminant) {
			case 1:
				return new Temporal.PlainDateTime(...rest);
			case 2:
				return getStr([rest[0], rest[1]] as WasmStr, this.#wasm);
			// Only ever 0:
			default:
				return undefined;
		}
	}

	firmwareVersion(headers: RawPointer<Headers>): Version {
		const version = this.#wasm.headers_firmwareVersion(headers);
		return new Version(...version);
	}

	unknownHeaders(headers: RawPointer<Headers>): ReadonlyMap<string, string> {
		const slice = this.#wasm.headers_unknown(headers);
		const map = new Map(HeadersParsers.getUnknownHeaderPairs(slice, this.#wasm));
		return freezeMap(map);
	}

	newData(
		headers: RawPointer<Headers>,
		frameDefs: { main: InternalFrameDef; slow: InternalFrameDef; gps: InternalFrameDef },
	): ManagedPointer<DataParser> {
		const dataPtr = this.#wasm.headers_getDataParser(headers) as RawPointer<DataParser>;

		const eventPtr = this.#wasm.data_resultPtr(dataPtr) as RawPointer<ParserEvent>;
		this.#dataParserInfo.set(dataPtr, { ...frameDefs, eventPtr });

		return new ManagedPointer(dataPtr, this.#wasm.data_free);
	}

	dataStats(data: RawPointer<DataParser>): Stats {
		const [event, main, slow, gps, gpsHome] = this.#wasm.data_counts(data);
		return {
			counts: { event, main, slow, gps, gpsHome },
		};
	}

	dataNext(data: RawPointer<DataParser>): ParserEvent | undefined {
		this.#wasm.data_next(data);
		const { eventPtr, ...frameDefs } = this.#dataParserInfo.get(data)!;

		const bytes = this.#uint8Array(eventPtr);

		const kind = DataParsers.getParserEventKind(bytes[0]);
		if (kind === undefined) {
			return;
		}

		const dataStart = eventPtr + 4;

		switch (kind) {
			case ParserEventKind.Event:
				return { kind, data: undefined };

			case ParserEventKind.MainFrame:
				return {
					kind,
					data: DataParsers.getMainData(this.#wasm.memory, dataStart, frameDefs.main),
				};

			case ParserEventKind.SlowFrame:
				return {
					kind,
					data: DataParsers.getSlowData(this.#wasm.memory, dataStart, frameDefs.slow),
				};

			case ParserEventKind.GpsFrame:
				return {
					kind,
					data: DataParsers.getGpsData(this.#wasm.memory, dataStart, frameDefs.gps),
				};

			default:
				unreachable(kind);
		}
	}

	#uint8Array(start: number, length?: number) {
		return new Uint8Array(this.#wasm.memory.buffer, start, length);
	}

	#uint32Array(start: number, length?: number) {
		return new Uint32Array(this.#wasm.memory.buffer, start, length);
	}
}
