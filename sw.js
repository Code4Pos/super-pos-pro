// Service Worker ของ SiamPOS Pro: ให้เปิดแอปได้แม้ไม่มีเน็ต (ข้อมูลขายใช้แคชใน LocalStorage + คิวซิงค์)
// - หน้าเว็บ (navigation): เน็ตก่อน ถ้าล่มใช้ index.html หรือ admin.html ที่แคชไว้
// - ไฟล์ใน assets/ (ชื่อมี hash): แคชก่อน
// - ไม่แคชคำขอไปโดเมนอื่น เช่น Supabase
const CACHE_NAME = 'siampos-shell-v2';
const SHELL_FILES = ['./', './index.html', './admin.html', './manifest.webmanifest', './icon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (!sameOrigin && !isFont) return;

  if (request.mode === 'navigate') {
    const isAdminRoute = url.pathname.endsWith('/admin.html') || url.pathname === '/admin.html';
    const targetShell = isAdminRoute ? './admin.html' : './index.html';
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(targetShell, copy));
          return response;
        })
        .catch(() => caches.match(targetShell).then((cached) => cached || caches.match('./')))
    );
    return;
  }

  // ไฟล์ static: ใช้แคชก่อน ถ้าไม่มีค่อยโหลดแล้วเก็บไว้
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((response) => {
        if (response.ok || response.type === 'opaque') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      });
    })
  );
});
