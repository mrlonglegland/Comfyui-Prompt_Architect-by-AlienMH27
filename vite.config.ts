import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [tailwindcss(), react()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      proxy: {
        '/ollama': {
          target: 'http://127.0.0.1:11434',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
          configure: (proxy, _options) => {
            // Remove Vite's default error handler to suppress console noise
            proxy.removeAllListeners('error');
            
            proxy.on('error', (err, _req, res) => {
              // Suppress ECONNREFUSED logs and send a 500 response
              if ((err as any).code === 'ECONNREFUSED') {
                try {
                  res.writeHead(500, {
                    'Content-Type': 'application/json',
                  });
                  res.end(JSON.stringify({ error: 'Ollama connection refused' }));
                } catch (e) {
                  // Ignore if headers already sent
                }
              } else {
                // For other errors, we might want to log them or handle them similarly
                try {
                  res.writeHead(500, {
                    'Content-Type': 'application/json',
                  });
                  res.end(JSON.stringify({ error: 'Proxy error' }));
                } catch (e) {
                  // Ignore
                }
              }
            });
          },
        },
      },
    },
  };
});
