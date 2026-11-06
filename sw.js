// sw.js - strona jak aplikacja na telefonie, także bez internetu.
// Strona (index.html) i lista jadłospisów zawsze najpierw z sieci; bez sieci
// pokazujemy ostatnio zapisaną wersję. Skrypt i style mają w adresie wersję (?v=),
// więc bierzemy je z pamięci, a stare wersje usuwamy po wczytaniu nowej strony.
// Pozostałe pliki PHP (wysyłka, konwersja, opisy dań, kalendarz) idą prosto do sieci.
// Zapisujemy tylko odpowiedzi, które naprawdę są stroną lub danymi (hosting czasem
// zamiast nich odsyła stronę ze sprawdzaniem przeglądarki).

const CACHE_NAME = 'obiady-v1';
const PAGE_MARKER = 'id="menuTable"';
const SCOPE_URL = new URL('./', self.location.href).href;
const SCOPE_PATH = new URL(SCOPE_URL).pathname;
const CDN_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const contentType = response => response.headers.get('content-type') || '';
const isAsset = response => response.ok && /javascript|css/.test(contentType(response));
const isJson = response => response.ok && contentType(response).includes('json');
const isImage = response => response.ok && /image|manifest|json/.test(contentType(response));
const isCdn = response => response.ok || response.type === 'opaque';

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(savePage(fetch(SCOPE_URL, { cache: 'no-cache' })).catch(() => {}));
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('obiady-') && name !== CACHE_NAME).map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);

  if (request.mode === 'navigate') {
    if (url.origin === self.location.origin && (url.pathname === SCOPE_PATH || url.pathname === SCOPE_PATH + 'index.html')) {
      event.respondWith(pageFromNetwork(event));
    }
    return;
  }
  if (url.origin === self.location.origin) {
    if (url.pathname === SCOPE_PATH + 'get_history.php') event.respondWith(networkFirst(event, isJson));
    else if (url.searchParams.has('v') && /\.(js|css)$/.test(url.pathname)) event.respondWith(cacheFirst(event, isAsset));
    else if (/\/(icons\/[\w.-]+\.png|logo\.png|manifest\.webmanifest)$/.test(url.pathname)) event.respondWith(cacheFirst(event, isImage));
    return;
  }
  if (CDN_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(event, isCdn));
});

// Zapisuje stronę (jeśli to naprawdę nasza strona) i skrypt ze stylami w tej wersji
async function savePage(responsePromise) {
  const response = await responsePromise;
  if (!response.ok || !contentType(response).includes('text/html')) return;
  const html = await response.text();
  if (!html.includes(PAGE_MARKER)) return;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(SCOPE_URL, new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  const assets = [...html.matchAll(/(?:src|href)="((?:script\.js|styles\.css)\?v=[\w-]+)"/g)].map(match => new URL(match[1], SCOPE_URL).href);
  await Promise.all(assets.map(async url => {
    if (await cache.match(url)) return;
    const asset = await fetch(url);
    if (isAsset(asset)) await cache.put(url, asset);
  }));
  // Stare wersje skryptu i stylów nie są już potrzebne
  const keys = await cache.keys();
  await Promise.all(keys.map(key => {
    const keyUrl = new URL(key.url);
    const versioned = keyUrl.origin === self.location.origin && keyUrl.searchParams.has('v') && /\.(js|css)$/.test(keyUrl.pathname);
    return versioned && !assets.includes(key.url) ? cache.delete(key) : null;
  }));
}

async function pageFromNetwork(event) {
  try {
    const response = await fetch(event.request);
    event.waitUntil(savePage(Promise.resolve(response.clone())).catch(() => {}));
    return response;
  } catch (error) {
    const cached = await caches.match(SCOPE_URL);
    if (cached) return cached;
    throw error;
  }
}

async function networkFirst(event, check) {
  try {
    const response = await fetch(event.request);
    if (check(response)) {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {}));
    }
    return response;
  } catch (error) {
    const cached = await caches.match(event.request);
    if (cached) return cached;
    throw error;
  }
}

async function cacheFirst(event, check) {
  const cached = await caches.match(event.request);
  if (cached) return cached;
  const response = await fetch(event.request);
  if (check(response)) {
    const copy = response.clone();
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy)).catch(() => {}));
  }
  return response;
}
