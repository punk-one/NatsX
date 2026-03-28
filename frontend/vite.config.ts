import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            const normalizedId = id.replaceAll('\\', '/')

            if (/node_modules\/(react|react-dom|scheduler)\//.test(normalizedId)) {
              return 'react-vendor'
            }
            if (
              /node_modules\/antd\//.test(normalizedId) ||
              /node_modules\/@ant-design\//.test(normalizedId) ||
              /node_modules\/rc-/.test(normalizedId)
            ) {
              return 'antd-vendor'
            }
            if (
              /node_modules\/cbor-x\//.test(normalizedId) ||
              /node_modules\/@msgpack\/msgpack\//.test(normalizedId)
            ) {
              return 'payload-vendor'
            }
          }
        },
      },
    },
  },
  server: {
    host: '0.0.0.0',
    port: 34115,
    strictPort: true,
  },
})
