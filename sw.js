// sw.js - wyłączony tryb bez internetu.
// Ochrona hostingu przed botami odsyłała zapytaniom z service workera stronę
// ze sprawdzaniem przeglądarki zamiast danych (np. listy jadłospisów), więc
// service worker niczego już nie przechwytuje. Ta wersja tylko sprząta po
// poprzedniej (06.11.2026): usuwa jej pamięć i wyrejestrowuje się.

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => name.startsWith('obiady-')).map(name => caches.delete(name)));
    await self.registration.unregister();
  })());
});
