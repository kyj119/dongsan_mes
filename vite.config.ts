import { defineConfig } from 'vite'
import pages from '@hono/vite-cloudflare-pages'

export default defineConfig({
  plugins: [pages()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      // cloudflare:sockets 는 Workers 런타임 제공 모듈(번들 금지) — 팩스 FTP 업로드(src/services/ftpUpload.ts)에서 사용
      external: ['cloudflare:sockets']
    }
  }
})
