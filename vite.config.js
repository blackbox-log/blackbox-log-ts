import fs from 'fs';
import { defineConfig } from 'vite';
import { viteStaticCopy as staticCopy } from 'vite-plugin-static-copy';
import dts from 'vite-plugin-dts';

// Vite default + wasm sign-extension, multi-value, and bulk memory
export const target = ['es2020', 'firefox79', 'safari15', 'chrome87', 'edge88'];

export default defineConfig({
	build: {
		lib: {
			entry: ['src/main.ts', 'src/slim.ts', 'src/async.ts'],
			name: 'BlackboxLog',
			formats: ['es', 'cjs'],
			fileName: (format, entry) => {
				const ext = format == 'cjs' ? 'cjs' : 'js';
				return `${entry}.${ext}`;
			},
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
				const wasm = await fs.promises.readFile(path, { encoding: 'base64' });

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
		dts(),
	],
});
