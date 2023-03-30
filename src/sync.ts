import { Memoize as memoize } from 'typescript-memoize';

import { Wasm } from './wasm';

import type { ParserEvent, Stats } from './data';
import type { FirmwareKind, FrameDef, InternalFrameDef, Version } from './headers';
import type { ManagedPointer, RawPointer, WasmInit, WasmObject } from './wasm';

export class Parser {
	static async init(init: WasmInit): Promise<Parser> {
		const wasm = await Wasm.init(init);
		return new Parser(wasm);
	}

	readonly #wasm;

	constructor(wasm: Wasm) {
		this.#wasm = wasm;
	}

	loadFile(data: Uint8Array): File {
		return new File(this.#wasm, data);
	}
}

export class File implements WasmObject {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<File>;

	#headers: Array<WeakRef<Headers>> = [];

	constructor(wasm: Wasm, data: Uint8Array) {
		this.#wasm = wasm;
		this.#ptr = wasm.newFile(data);
	}

	free() {
		for (const headers of this.#headers) {
			headers.deref()?.free();
		}

		this.#ptr.free();
	}

	get isAlive(): boolean {
		return this.#ptr.isAlive;
	}

	get logCount(): number {
		return this.#wasm.logCount(this.#ptr.ptr);
	}

	parseHeaders(log: number): Headers | undefined {
		if (log >= this.logCount) {
			return;
		}

		if (log in this.#headers && this.#headers[log].deref()?.isAlive) {
			return this.#headers[log].deref();
		}

		const headers = new Headers(this.#wasm, this.#ptr.ptr, log);
		this.#headers[log] = new WeakRef(headers);
		return headers;
	}

	get memorySize(): number {
		return this.#wasm.memorySize();
	}
}

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

export class DataParser implements WasmObject, IterableIterator<ParserEvent> {
	readonly #wasm: Wasm;
	readonly #ptr: ManagedPointer<DataParser>;
	readonly #headers: Headers;
	#done = false;

	constructor(wasm: Wasm, ptr: ManagedPointer<DataParser>, headers: Headers) {
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

	get headers(): Headers {
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
