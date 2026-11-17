import { resolve } from 'path'
import { readFileSync } from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// ระดับโค้ด native ที่ bundle นี้ต้องการ (native-version.json) ใช้ในระบบอัปเดตแอป Android
const nativeApi = Number(JSON.parse(readFileSync(resolve(__dirname, 'native-version.json'), 'utf8')).nativeApi) || 1

export default defineConfig({
  base: './',
  define: {
    __SIAMPOS_NATIVE_API__: JSON.stringify(nativeApi),
  },
  plugins: [react()],
  server: {
    port: 5173,
    host: true
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          supabase: ['@supabase/supabase-js'],
          icons: ['lucide-react'],
          thaiAddress: ['./src/data/thaiAddressTree.json']
        }
      }
    }
  }
})
