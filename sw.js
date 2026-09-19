/**
 * Service Worker für den Offline-Start der App selbst.
 *
 * Wichtig: Das hier ist nur für die App-Hülle (HTML, JS, CSS, Bilder) da –
 * für die eigentlichen Haushaltsdaten gibt es bereits einen eigenen
 * Zwischenspeicher in `githubStorage.ts`. Beide zusammen sorgen dafür, dass
 * die Seite ohne Netz überhaupt lädt und danach den zuletzt bekannten
 * Datenstand zeigt.
 *
 * Strategie: "Netz zuerst, Zwischenspeicher als Rettung". Jede Anfrage geht
 * zuerst normal ins Netz; klappt das, landet die Antwort zusätzlich im
 * Zwischenspeicher und wird ganz normal angezeigt – man bekommt also immer
 * den aktuellen Stand, solange Netz da ist. Nur wenn das Netz fehlschlägt,
 * springt die zuletzt gespeicherte Antwort ein. So bleibt die App nutzbar,
 * ohne dass hier irgendetwas "veraltet gewinnt".
 *
 * Es gibt bewusst keine feste Liste von Dateinamen zum Vorab-Zwischenspeichern
 * – die von Vite gebauten Dateien tragen bei jedem Bau neue, zufällige Namen
 * in sich (z. B. `index-a1b2c3.js`). Stattdessen wächst der Zwischenspeicher
 * einfach mit dem, was tatsächlich abgerufen wird, und die ältesten Einträge
 * fallen automatisch heraus, sobald es zu viele werden – so verschwinden die
 * Dateien eines alten Bauzustands von selbst wieder.
 */

const CACHE_NAME = 'skaessle-huelle-v1'
const MAX_EINTRAEGE = 60

self.addEventListener('install', () => {
  // Sofort aktiv werden, nicht erst warten, bis alle alten Tabs zu sind.
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

async function cacheAufraeumen(cache) {
  const schluessel = await cache.keys()
  const ueberschuss = schluessel.length - MAX_EINTRAEGE
  for (let i = 0; i < ueberschuss; i++) {
    await cache.delete(schluessel[i])
  }
}

self.addEventListener('fetch', (event) => {
  const anfrage = event.request

  // Nur eigene, lesende Anfragen zwischenspeichern. Anfragen an die
  // GitHub-API (anderer Ursprung) laufen hier bewusst nicht durch – die hat
  // bereits ihren eigenen Offline-Zwischenspeicher, und ein Durcheinander
  // zweier Zwischenspeicher für dieselben Daten wäre nur verwirrend.
  if (anfrage.method !== 'GET') return
  const url = new URL(anfrage.url)
  if (url.origin !== self.location.origin) return

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE_NAME)
      try {
        const antwort = await fetch(anfrage)
        if (antwort.ok) {
          await cache.put(anfrage, antwort.clone())
          await cacheAufraeumen(cache)
        }
        return antwort
      } catch {
        const gespeichert = await cache.match(anfrage)
        if (gespeichert) return gespeichert
        // Beim Neuladen einer Unterseite ohne Netz und ohne passenden
        // Zwischenspeicher-Eintrag hilft nur noch die Startseite selbst.
        // `self.registration.scope` statt eines fest eingetragenen "/", weil
        // GitHub Pages die App unter einem Unterpfad ausliefert
        // (.../skaessle/) – dort wäre "/" die falsche, nicht zwischen-
        // gespeicherte Adresse.
        if (anfrage.mode === 'navigate') {
          const start = await cache.match(self.registration.scope)
          if (start) return start
        }
        throw new Error('Kein Netz und nichts im Zwischenspeicher.')
      }
    })(),
  )
})
