import encodedWasm from '../blackbox-log.wasm?inline';

export * from './common';

export async function getWasm(): Promise<WebAssembly.Module> {
	const decoded = atob(encodedWasm);

	const bytes = new Uint8Array(decoded.length);
	for (let i = 0; i < decoded.length; i++) {
		// eslint-disable-next-line unicorn/prefer-code-point
		bytes[i] = decoded.charCodeAt(i);
	}

	return WebAssembly.compile(bytes);
}
