import * as DataParsers from './data';
import { FrameKind, getFieldDefs } from './frames';
import * as HeadersParsers from './headers';
import { ManagedPointer } from './pointers';
import { getOptionalStr, getStr, getStrSlice } from './str';
import { ParserEventKind } from '../data';
import { FirmwareKind, Version } from '../headers';
import { ParseError } from '../parse-error';
import { freezeMap, freezeSet, unreachable } from '../utils';

import type { FieldDef } from './frames';
import type { RawPointer } from './pointers';
import type { WasmSlice } from './slice';
import type { OptionalWasmStr, WasmStr } from './str';
import type { DataParser, DataParserOptions, ParserEvent, Stats } from '../data';
import type { LogFile } from '../file';
import type { InternalFrameDef, LogHeaders } from '../headers';

export type { RawPointer, ManagedPointer } from './pointers';

export type WasmObject = {
	isAlive: boolean;
	free(): void;
};

/* eslint-disable @typescript-eslint/naming-convention */
export type WasmExports = {
	memory: WebAssembly.Memory;

	data_alloc: (length: number) => number;
	slice8_free: (length: number, ptr: number) => void;
	sliceStr_free: (length: number, ptr: number) => void;

	file_free: (ptr: number) => void;
	file_new: (ptr: number, length: number) => RawPointer<LogFile>;
	file_logCount: (ptr: number) => number;
	file_getHeaders: (ptr: number, log: number) => RawPointer<LogHeaders>;
	file_getLog: (ptr: number, log: number) => number;

	headers_free: (ptr: number) => void;
	headers_frameDef: (ptr: number, frame: FrameKind) => number;
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
	data_new: (
		headers: number,
		filters: number,
	) => [RawPointer<DataParser>, RawPointer<ParserEvent>];
	data_frameDef: (ptr: number, frame: FrameKind) => number;
	data_stats: (ptr: number) => [number, number, number, number, number, number];
	data_next: (ptr: RawPointer<DataParser>) => void;
	filter_new: (
		arenaLength: number,
		main: number,
		slow: number,
		gps: number,
	) => [filterSetPtr: number, arenaPtr: number];
	filter_push: (filters: number, frame: FrameKind, len: number, ptr: number) => number;
};
/* eslint-enable @typescript-eslint/naming-convention */

type FrameDefKind = 'main' | 'slow' | 'gps';
type DataParseInfo = Record<FrameDefKind, InternalFrameDef> & {
	eventPtr: RawPointer<ParserEvent>;
};

export type WasmInit =
	| string
	| URL
	| Request
	| Response
	| PromiseLike<Response>
	| WebAssembly.Module
	| PromiseLike<WebAssembly.Module>;

declare const dataParserId: unique symbol;
export type DataParserId = number & { [dataParserId]: true };

/** @internal */
export class Wasm {
	static async init(init: WasmInit): Promise<Wasm> {
		let instance;
		let exports: WasmExports | undefined; // eslint-disable-line prefer-const

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

		init = await init;
		if (init instanceof WebAssembly.Module) {
			instance = new WebAssembly.Instance(init, imports);
		} else {
			const response = init instanceof Response ? init : fetch(init);

			const wasmModule = await WebAssembly.instantiateStreaming(response, imports);
			instance = wasmModule.instance;
		}

		exports = instance.exports as WasmExports;
		return new Wasm(exports);
	}

	readonly #wasm;
	#dataParserInfo = new Map<RawPointer<DataParser>, DataParseInfo>();

	#_cachedUint8Array: Uint8Array | undefined;
	#_cachedDataView: DataView | undefined;

	private constructor(wasm: WasmExports) {
		this.#wasm = wasm;
	}

	memorySize(): number {
		return this.#wasm.memory.buffer.byteLength;
	}

	newFile(data: Uint8Array): ManagedPointer<LogFile> {
		const dataPtr = this.#wasm.data_alloc(data.length);
		if (dataPtr === 0) {
			throw new Error('file allocation failed');
		}

		const buffer = new Uint8Array(this.#wasm.memory.buffer, dataPtr, data.length);
		buffer.set(data);

		const filePtr = this.#wasm.file_new(dataPtr, data.length);
		return new ManagedPointer(filePtr, this.#wasm.file_free);
	}

	logCount(file: RawPointer<LogFile>): number {
		return this.#wasm.file_logCount(file);
	}

	newHeaders(file: RawPointer<LogFile>, log: number): ManagedPointer<LogHeaders> {
		const ptr = this.#wasm.file_getHeaders(file, log);
		return new ManagedPointer(ptr, this.freeHeaders.bind(this));
	}

	freeHeaders(headers: RawPointer<LogHeaders>) {
		this.#wasm.headers_free(headers);
	}

	frameDef(
		container: 'headers',
		containerPtr: RawPointer<LogHeaders>,
		frame: FrameKind,
	): InternalFrameDef;
	frameDef(
		container: 'data',
		containerPtr: RawPointer<DataParser>,
		frame: FrameKind,
	): InternalFrameDef;
	frameDef(
		container: 'headers' | 'data',
		containerPtr: RawPointer<LogHeaders | DataParser>,
		frame: FrameKind,
	): InternalFrameDef {
		const memory = this.#dataView;
		const ptr = this.#wasm[`${container}_frameDef`](containerPtr, frame);
		const len = memory.getUint32(ptr, true);
		const fields = memory.getUint32(ptr + 4, true);

		const def = freezeMap(
			new Map(getFieldDefs([len, fields] as WasmSlice<[string, FieldDef]>, this.#wasm)),
		);

		this.#wasm.frameDef_free(ptr);
		return def;
	}

	strHeader(
		headers: RawPointer<LogHeaders>,
		header: 'firmwareRevision' | 'debugMode' | 'pwmProtocol',
	): string {
		const str = this.#wasm[`headers_${header}`](headers);
		return getStr(str, this.#wasm);
	}

	strOptionHeader(
		headers: RawPointer<LogHeaders>,
		header: 'boardInfo' | 'craftName',
	): string | undefined {
		const str = this.#wasm[`headers_${header}`](headers);
		return getOptionalStr(str, this.#wasm);
	}

	strSetHeader(
		headers: RawPointer<LogHeaders>,
		header: 'disabledFields' | 'features',
	): ReadonlySet<string> {
		const slice = this.#wasm[`headers_${header}`](headers);
		const fields = new Set(getStrSlice(slice, this.#wasm));
		return freezeSet(fields);
	}

	firmwareKind(headers: RawPointer<LogHeaders>): FirmwareKind {
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

	firmwareDate(headers: RawPointer<LogHeaders>): Date | string | undefined {
		const [discriminant, ...rest] = this.#wasm.headers_firmwareDate(headers);
		switch (discriminant) {
			case 1:
				return new Date(Date.UTC(...rest));
			case 2:
				return getStr([rest[0], rest[1]] as WasmStr, this.#wasm);
			// Only ever 0:
			default:
				return undefined;
		}
	}

	firmwareVersion(headers: RawPointer<LogHeaders>): Version {
		const version = this.#wasm.headers_firmwareVersion(headers);
		return new Version(...version);
	}

	unknownHeaders(headers: RawPointer<LogHeaders>): ReadonlyMap<string, string> {
		const slice = this.#wasm.headers_unknown(headers);
		const map = new Map(HeadersParsers.getUnknownHeaderPairs(slice, this.#wasm));
		return freezeMap(map);
	}

	newData(
		headers: RawPointer<LogHeaders>,
		options: DataParserOptions,
	): ManagedPointer<DataParser> {
		const { fields } = options;
		let filterSetPtr = 0;
		if (fields && (fields.main ?? fields.slow ?? fields.gps)) {
			const { main, slow, gps } = fields;
			const encoder = new TextEncoder();

			const arenaLength =
				[main, slow, gps].flat().reduce((acc, s) => acc + (s?.length ?? 0), 0) * 3;

			const filterNewPtrs = this.#wasm.filter_new(
				arenaLength,
				main?.length ?? -1,
				slow?.length ?? -1,
				gps?.length ?? -1,
			);
			filterSetPtr = filterNewPtrs[0];
			const arenaPtr = filterNewPtrs[1];
			const arenaEnd = arenaPtr + arenaLength;

			let ptr = arenaPtr;
			const memory = this.#memoryBytes;

			const encodeAllFields = (frame: FrameKind, fields?: string[]) => {
				for (const field of fields ?? []) {
					const { written } = encoder.encodeInto(field, memory.subarray(ptr, arenaEnd));
					this.#wasm.filter_push(filterSetPtr, frame, written!, ptr);
					ptr += written!;
				}
			};

			encodeAllFields(FrameKind.Main, main);
			encodeAllFields(FrameKind.Slow, slow);
			encodeAllFields(FrameKind.Gps, gps);
		}

		const [data, eventPtr] = this.#wasm.data_new(headers, filterSetPtr);

		this.#dataParserInfo.set(data, {
			main: this.frameDef('data', data, FrameKind.Main),
			slow: this.frameDef('data', data, FrameKind.Slow),
			gps: this.frameDef('data', data, FrameKind.Gps),
			eventPtr,
		});
		return new ManagedPointer(data, this.#wasm.data_free);
	}

	dataStats(data: RawPointer<DataParser>): Stats {
		const [event, main, slow, gps, gpsHome, progress] = this.#wasm.data_stats(data);
		return {
			counts: { event, main, slow, gps, gpsHome },
			progress,
		};
	}

	dataNext(data: RawPointer<DataParser>): ParserEvent | undefined {
		this.#wasm.data_next(data);
		const { eventPtr, ...frameDefs } = this.#dataParserInfo.get(data)!;

		const memory = this.#dataView;

		const kind = DataParsers.getParserEventKind(memory.getUint8(eventPtr));
		if (kind === undefined) {
			return;
		}

		const dataAlignment = 8;
		const dataStart = eventPtr + dataAlignment;

		switch (kind) {
			case ParserEventKind.Event:
				return { kind, data: undefined };

			case ParserEventKind.MainFrame:
				return {
					kind,
					data: DataParsers.getMainData(memory, dataStart, frameDefs.main),
				};

			case ParserEventKind.SlowFrame:
				return {
					kind,
					data: DataParsers.getSlowData(memory, dataStart, frameDefs.slow),
				};

			case ParserEventKind.GpsFrame:
				return {
					kind,
					data: DataParsers.getGpsData(memory, dataStart, frameDefs.gps),
				};

			default:
				unreachable(kind);
		}
	}

	get #dataView(): DataView {
		if (this.#_cachedDataView?.byteLength) {
			return this.#_cachedDataView;
		}

		return (this.#_cachedDataView = new DataView(this.#wasm.memory.buffer));
	}

	get #memoryBytes(): Uint8Array {
		if (this.#_cachedUint8Array?.byteLength) {
			return this.#_cachedUint8Array;
		}

		return (this.#_cachedUint8Array = new Uint8Array(this.#wasm.memory.buffer));
	}
}
