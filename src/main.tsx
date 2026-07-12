import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

// PWA: 本番ビルドのみService Workerを登録する（開発中はHMRと干渉するため無効）
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      // 登録失敗（非HTTPS環境など）は無視。アプリ自体は通常どおり動く
    });
  });
}
