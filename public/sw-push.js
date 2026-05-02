// public/sw-push.js
// ProPlan Scholar — push notification service worker.
// Registered separately from the PWA service worker. Single responsibility:
// listen for push events from our /api/push/send cron and display a notification,
// and handle clicks by opening (or focusing) the app.

self.addEventListener('install', (event) => {
  // Activate immediately so updates take effect on the next page load
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    // Fallback for non-JSON payloads
    data = { title: 'ProPlan Scholar', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'ProPlan Scholar';
  const options = {
    body: data.body || '',
    icon: data.icon || '/favicon.svg',
    badge: data.badge || '/favicon.svg',
    tag: data.tag || 'proplan-scholar',
    renotify: true,
    requireInteraction: false,
    data: { url: data.url || '/app' },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || '/app';
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    // If a ProPlan window is already open, focus it
    for (const client of allClients) {
      if (client.url.includes('proplanscholar.com') || client.url.includes(self.registration.scope)) {
        await client.focus();
        // Best-effort navigation
        try { if ('navigate' in client) await client.navigate(targetUrl); } catch (_) {}
        return;
      }
    }
    // Otherwise open a new window
    await self.clients.openWindow(targetUrl);
  })());
});

// Optional: handle subscription change (browser rotates the endpoint)
self.addEventListener('pushsubscriptionchange', (event) => {
  // Best-effort re-subscription. The app code will also re-subscribe on next visit.
  event.waitUntil((async () => {
    try {
      // No VAPID key available inside SW unless we hardcode it. Easier: tell the page
      // to re-subscribe on next load by clearing any cached endpoint hint.
      const clientsList = await self.clients.matchAll({ includeUncontrolled: true });
      clientsList.forEach((c) => c.postMessage({ type: 'push-resubscribe-needed' }));
    } catch (_) {}
  })());
});
