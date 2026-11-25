/* GB GOBÊ · service worker
   Permite instalar o sistema como aplicativo. Não guarda dados em cache:
   os pedidos sempre vêm direto do servidor, sempre atualizados. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
