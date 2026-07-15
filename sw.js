self.addEventListener('push', function(event){
  let data = {};
  try{ data = event.data ? event.data.json() : {}; } catch(e){ data = { title: '通知', body: event.data ? event.data.text() : '' }; }
  const title = data.title || '期限のお知らせ';
  const options = {
    body: data.body || '',
    icon: data.icon || undefined,
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList){
      for(const client of clientList){
        if('focus' in client){ return client.focus(); }
      }
      if(self.clients.openWindow){ return self.clients.openWindow(url); }
    })
  );
});
