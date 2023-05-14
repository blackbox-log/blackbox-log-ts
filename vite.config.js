import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import { viteStaticCopy as staticCopy } from 'vite-plugin-static-copy';
import { dependencies } from './package.json';

const isDev = process.env.NODE_ENV === 'development';

// Vite default + wasm sign-extension, multi-value, and bulk memory
export const target = [
	'es2020',
	'firefox79',
	'safari15',
	'chrome87',
	'edge88',
	'node18',
	'deno1.3.2',
];

export default defineConfig({
	build: {
		lib: {
			entry: ['main', 'slim'].map((s) => `src/entry/${s}.ts`),
			formats: ['es'],
			fileName: (_format, entry) => `${entry}.js`,
		},
		rollupOptions: {
			external: Object.keys(dependencies),
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
	],
});
