import encodedWasm from '../blackbox-log.wasm?inline';
import worker from '../worker?url';

export * from './common';
export * from '../async';
export * from '../sync';
export { worker };

export async function getWasm(): Promise<WebAssembly.Module> {
	const decoded = atob(encodedWasm);

	const bytes = new Uint8Array(decoded.length);
	for (let i = 0; i < decoded.length; i++) {
		bytes[i] = decoded.charCodeAt(i);
	}

	return WebAssembly.compile(bytes);
}
