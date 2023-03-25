import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';
import { viteStaticCopy as staticCopy } from 'vite-plugin-static-copy';
import dts from 'vite-plugin-dts';

// Vite default + wasm sign-extension, multi-value, and bulk memory
export const target = ['es2020', 'firefox79', 'safari15', 'chrome87', 'edge88'];

export default defineConfig({
	build: {
		lib: {
			entry: ['src/main.ts', 'src/slim.ts', 'src/async.ts'],
			formats: ['es'],
			fileName: (_format, entry) => `${entry}.js`,
		},
		target,
		sourcemap: true,
	},
	plugins: [
		{
			name: 'inline-wasm',
			async transform(_, id) {
				if (!id.endsWith('.wasm?inline')) return;

				const path = id.replace('?inline', '');
				const wasm = await readFile(path, { encoding: 'base64' });

				return {
					code: `export default '${wasm}'`,
					map: { mappings: '' },
				};
			},
		},
		staticCopy({
			targets: [
				{
					src: 'src/blackbox-log.wasm',
					dest: '',
				},
			],
			watch: {
				reloadPageOnChange: true,
			},
		}),
		dts({
			rollupTypes: true,
		}),
	],
});
