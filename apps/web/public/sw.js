/**
 * Service worker des billets.
 *
 * Le pire moment pour qu'une page échoue est l'entrée d'une salle : réseau
 * saturé par trois cents téléphones, sous-sol sans signal, forfait épuisé. Le
 * billet doit s'afficher quand même — c'est la seule page du site dont l'échec
 * a une conséquence physique immédiate pour son porteur.
 *
 * Enregistré depuis `/t/<serial>`, sa portée est donc `/t/` : il ne contrôle
 * que les pages de billet. Les sous-ressources d'une page contrôlée passent en
 * revanche toutes par lui, y compris les fichiers `/_next/static/`, ce qui
 * suffit à rendre la page autonome.
 *
 * Stratégies :
 *  - navigations : réseau d'abord, cache en secours. Un billet remboursé ou
 *    déjà scanné doit refléter son état réel dès qu'il y a du réseau ; le cache
 *    n'est qu'un filet.
 *  - `/_next/static/` : cache d'abord. Ces fichiers portent un hachage dans leur
 *    nom, ils ne changent jamais à URL constante.
 */
const CACHE = "eventgalo-billets-v1";

self.addEventListener("install", (event) => {
  // Pas de pré-chargement : on ne connaît pas les noms de fichiers hachés du
  // build. Le cache se remplit à la première visite en ligne, qui a forcément
  // lieu (on arrive sur son billet par un lien reçu par email).
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/** Met en cache une réponse réussie sans jamais faire échouer l'appelant. */
function remember(request, response) {
  if (!response || !response.ok || response.type === "opaque") return response;
  const copy = response.clone();
  caches
    .open(CACHE)
    .then((cache) => cache.put(request, copy))
    .catch(() => {
      // Quota plein ou stockage refusé : le billet marche encore en ligne.
    });
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then((hit) => hit || fetch(request).then((res) => remember(request, res))),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((res) => remember(request, res))
        .catch(() => caches.match(request).then((hit) => hit || Response.error())),
    );
  }
});
