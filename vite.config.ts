import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // 相対パスでビルドする（GitHub Pagesのように /tja-editor/ のような
  // サブフォルダで配信されても動くように。独自ドメイン直下でもそのまま動く）
  base: './',
});
