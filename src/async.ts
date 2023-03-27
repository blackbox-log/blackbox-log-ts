import * as Comlink from 'comlink';
import { Temporal } from 'temporal-polyfill';

import { Version } from './headers';
import { freezeMap, freezeSet } from './utils';

import type { ParserEvent, Stats } from './data';
import type { FirmwareKind, FrameDef } from './headers';
import type { DataParser, File, Headers, Parser } from './sync';
import type { WasmInit, WasmObject } from './wasm';
import type { AsyncWasm, DataParserId, HeadersId } from './worker';

if (import.meta.env.DEV) {
	// @ts-expect-error Missing declaration file
	await import('module-workers-polyfill');
}

type Methods<T, OmitKeys extends keyof T = never> = Omit<{ [Key in keyof T]: any }, OmitKeys>;

export class AsyncParser implements Methods<Parser> {
	readonly #wasm;
	readonly #worker;

	constructor(wasm: WasmInit, worker: URL | string) {
		this.#wasm = resolveWasm(wasm);
		this.#worker = worker;
	}

	async loadFile(data: Uint8Array): Promise<AsyncFile> {
		const options: WorkerOptions = {};
		if (import.meta.env.DEV) {
			options.type = 'module';
		}

		const worker = new Worker(this.#worker, options);
		const wrapped = Comlink.wrap<AsyncWasm>(worker);

		const wasm = await this.#wasm;
		await wrapped.init(wasm, Comlink.transfer(data, [data.buffer]));

		return new AsyncFile(wrapped);
	}
}

async function resolveWasm(init: WasmInit): Promise<string | URL | WebAssembly.Module> {
	init = await init;

	if (init instanceof URL) {
		return init.toString();
	}

	if (typeof init === 'string' || init instanceof WebAssembly.Module) {
		return init;
	}

	const response = init instanceof Request ? fetch(init) : init;
	return WebAssembly.compileStreaming(response);
}

export class AsyncFile implements Methods<File, keyof WasmObject> {
	readonly #wasm;

	constructor(wasm: Comlink.Remote<AsyncWasm>) {
		this.#wasm = wasm;
	}

	get logCount(): Promise<number> {
		return this.#wasm.logCount();
	}

	async parseHeaders(log: number): Promise<AsyncHeaders | undefined> {
		const id = await this.#wasm.newHeaders(log);

		if (id === undefined) {
			return undefined;
		}

		return new AsyncHeaders(this.#wasm, id);
	}

	get memorySize(): Promise<number> {
		return this.#wasm.memorySize();
	}
}

export class AsyncHeaders implements Methods<Headers, keyof WasmObject> {
	readonly #wasm;
	readonly #id;

	constructor(wasm: Comlink.Remote<AsyncWasm>, id: HeadersId) {
		this.#wasm = wasm;
		this.#id = id;
	}

	async getDataParser(): Promise<AsyncDataParser> {
		const id = await this.#wasm.newData(this.#id);
		return new AsyncDataParser(this.#wasm, id, this);
	}

	get mainFrameDef(): Promise<FrameDef> {
		return this.#wasm.frameDef(this.#id, 'main');
	}

	get slowFrameDef(): Promise<FrameDef> {
		return this.#wasm.frameDef(this.#id, 'slow');
	}

	get gpsFrameDef(): Promise<FrameDef> {
		return this.#wasm.frameDef(this.#id, 'gps');
	}

	get firmwareRevision(): Promise<string> {
		return this.#wasm.strHeader(this.#id, 'firmwareRevision');
	}

	get firmwareKind(): Promise<FirmwareKind> {
		return this.#wasm.firmwareKind(this.#id);
	}

	get firmwareDate(): Promise<Temporal.PlainDateTime | string | undefined> {
		return this.#wasm.firmwareDate(this.#id).then((date) => {
			if (typeof date === 'object') {
				return new Temporal.PlainDateTime(
					date.isoYear,
					date.isoMonth,
					date.isoDay,
					date.isoHour,
					date.isoMinute,
					date.isoSecond,
					date.isoMillisecond,
					date.isoMicrosecond,
					date.isoNanosecond,
				);
			}

			return date;
		});
	}

	get firmwareVersion(): Promise<Version> {
		return this.#wasm
			.firmwareVersion(this.#id)
			.then(({ major, minor, patch }) => new Version(major, minor, patch));
	}

	get boardInfo(): Promise<string | undefined> {
		return this.#wasm.strOptionHeader(this.#id, 'boardInfo');
	}

	get craftName(): Promise<string | undefined> {
		return this.#wasm.strOptionHeader(this.#id, 'craftName');
	}

	get debugMode(): Promise<string> {
		return this.#wasm.strHeader(this.#id, 'debugMode');
	}

	get disabledFields(): Promise<ReadonlySet<string>> {
		return this.#wasm
			.strSetHeader(this.#id, 'disabledFields')
			.then((set) => freezeSet(set as Set<string>));
	}

	get features(): Promise<ReadonlySet<string>> {
		return this.#wasm
			.strSetHeader(this.#id, 'features')
			.then((set) => freezeSet(set as Set<string>));
	}

	get pwmProtocol(): Promise<string> {
		return this.#wasm.strHeader(this.#id, 'pwmProtocol');
	}

	get unknown(): Promise<ReadonlyMap<string, string>> {
		return this.#wasm
			.unknownHeaders(this.#id)
			.then((map) => freezeMap(map as Map<string, string>));
	}
}

export class AsyncDataParser
	implements
		Methods<DataParser, keyof WasmObject | SymbolConstructor['iterator']>,
		AsyncIterableIterator<ParserEvent>
{
	readonly #wasm;
	readonly #id;
	readonly #headers;
	#done = false;

	constructor(wasm: Comlink.Remote<AsyncWasm>, id: DataParserId, headers: AsyncHeaders) {
		this.#wasm = wasm;
		this.#id = id;
		this.#headers = headers;
	}

	get headers(): AsyncHeaders {
		return this.#headers;
	}

	async stats(): Promise<Readonly<Stats>> {
		return this.#wasm.dataStats(this.#id);
	}

	[Symbol.asyncIterator]() {
		return this;
	}

	get done(): boolean {
		return this.#done;
	}

	async next(): Promise<IteratorResult<Readonly<ParserEvent>>> {
		if (this.#done) {
			return { done: true, value: undefined };
		}

		const value = await this.#wasm.dataNext(this.#id);

		if (value === undefined) {
			this.#done = true;
			return { done: true, value: undefined };
		}

		return { done: false, value };
	}
}
