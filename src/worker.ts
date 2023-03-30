import * as Comlink from 'comlink';

import { Wasm } from './wasm';

import type { ParserEvent, Stats } from './data';
import type { FirmwareKind, InternalFrameDef, Version } from './headers';
import type { DataParser, LogFile, LogHeaders } from './sync';
import type { ManagedPointer, RawPointer, WasmInit } from './wasm';

type WasmMethods = {
	[Method in keyof Wasm]: any;
};

declare const headerId: unique symbol;
export type HeadersId = number & { [headerId]: true };

declare const dataParserId: unique symbol;
export type DataParserId = number & { [dataParserId]: true };

export class AsyncWasm implements Omit<WasmMethods, 'newFile' | 'freeHeaders'> {
	#wasm: Wasm | undefined;
	#file: ManagedPointer<LogFile> | undefined;
	#headers = new Map<number, ManagedPointer<LogHeaders>>();
	#dataParsers: Array<ManagedPointer<DataParser>> = [];

	async init(wasm: WasmInit, file: Uint8Array) {
		this.#wasm = await Wasm.init(wasm);
		this.#file = this.#wasm.newFile(file);
	}

	memorySize(): number {
		return this.#getWasm().memorySize();
	}

	logCount(): number {
		return this.#getWasm().logCount(this.#getFile());
	}

	newHeaders(log: number): HeadersId | undefined {
		const wasm = this.#getWasm();
		const file = this.#getFile();

		if (log >= wasm.logCount(file)) {
			return;
		}

		if (!this.#headers.has(log)) {
			this.#headers.set(log, wasm.newHeaders(file, log));
		}

		return log as HeadersId;
	}

	frameDef(headers: HeadersId, frame: Parameters<Wasm['frameDef']>[1]): InternalFrameDef {
		return this.#getWasm().frameDef(this.#getHeaders(headers), frame);
	}

	strHeader(headers: HeadersId, header: Parameters<Wasm['strHeader']>[1]): string {
		return this.#getWasm().strHeader(this.#getHeaders(headers), header);
	}

	strOptionHeader(
		headers: HeadersId,
		header: Parameters<Wasm['strOptionHeader']>[1],
	): string | undefined {
		return this.#getWasm().strOptionHeader(this.#getHeaders(headers), header);
	}

	strSetHeader(
		headers: HeadersId,
		header: Parameters<Wasm['strSetHeader']>[1],
	): ReadonlySet<string> {
		return this.#getWasm().strSetHeader(this.#getHeaders(headers), header);
	}

	firmwareKind(headers: HeadersId): FirmwareKind {
		return this.#getWasm().firmwareKind(this.#getHeaders(headers));
	}

	firmwareDate(headers: HeadersId): Date | string | undefined {
		return this.#getWasm().firmwareDate(this.#getHeaders(headers));
	}

	firmwareVersion(headers: HeadersId): Version {
		return this.#getWasm().firmwareVersion(this.#getHeaders(headers));
	}

	unknownHeaders(headers: HeadersId): ReadonlyMap<string, string> {
		return this.#getWasm().unknownHeaders(this.#getHeaders(headers));
	}

	newData(headers: HeadersId): DataParserId {
		const i = this.#dataParsers.length;
		this.#dataParsers.push(this.#getWasm().newData(this.#getHeaders(headers)));
		return i as DataParserId;
	}

	dataStats(data: DataParserId): Stats {
		return this.#getWasm().dataStats(this.#getDataParser(data));
	}

	dataNext(data: DataParserId): ParserEvent | undefined {
		return this.#getWasm().dataNext(this.#getDataParser(data));
	}

	#getWasm(): Wasm {
		if (this.#wasm === undefined) {
			throw new Error('never initialized');
		}

		return this.#wasm;
	}

	#getFile(): RawPointer<LogFile> {
		if (this.#file === undefined) {
			throw new Error('never initialized');
		} else {
			return this.#file.ptr;
		}
	}

	#getHeaders(id: HeadersId): RawPointer<LogHeaders> {
		const headers = this.#headers.get(id);

		if (headers === undefined) {
			throw new Error(`headers for log ${id} not initialized`);
		} else {
			return headers.ptr;
		}
	}

	#getDataParser(id: DataParserId): RawPointer<DataParser> {
		return this.#dataParsers[id].ptr;
	}
}

Comlink.expose(new AsyncWasm());
