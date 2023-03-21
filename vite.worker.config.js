import { defineConfig } from 'vite';

import { target } from './vite.config';

export default defineConfig({
	build: {
		emptyOutDir: false,
		lib: {
			entry: 'src/worker.ts',
			name: 'W',
			formats: ['iife'],
			fileName: () => 'worker.js',
		},
		target,
		sourcemap: true,
	},
});
