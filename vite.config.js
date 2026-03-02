import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		host: true,
		port: 5173,
		strictPort: true,
		open: true,
		watch: {
			usePolling: true,
		},
		hmr: {
			port: 5173,
			clientPort: 5173,
		},
	},
});
