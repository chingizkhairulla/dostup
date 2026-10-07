// Firebase Messaging Service Worker
// Handles push notifications independently from the main PWA Service Worker
// Registered at scope /firebase-cloud-messaging-push-scope to avoid conflicts

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Raw push handler — shows notification in ALL states (foreground + background)
self.addEventListener('push', (event) => {
  const payload = event.data?.json() || {};
  const data = payload.data || {};

  if (!data.title) return;

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body || "",
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag: data.type || "default",
      data: data,
      vibrate: [200, 100, 200],
      requireInteraction: true
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data || {};
  let targetUrl = '/';

  if (data.type === 'payment') {
    targetUrl = '/creator?tab=users';
  } else if (data.type === 'booking' || data.type === 'cancellation') {
    targetUrl = '/creator';
  } else if (data.type === 'creator_cancellation' || data.type === 'reminder' || data.type === 'material_unlocked') {
    targetUrl = '/dashboard';
  } else if (data.type === 'moderator_topic') {
    targetUrl = '/moderator?section=topic_suggestions';
  } else if (data.type === 'moderator_support') {
    targetUrl = '/moderator?section=support';
  } else if (data.type === 'moderator_report') {
    targetUrl = '/moderator?section=reports';
  } else if (data.type?.startsWith('moderator')) {
    targetUrl = '/moderator';
  }

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.navigate(targetUrl);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
