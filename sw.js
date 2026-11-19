/* Keeps the planner working without a connection. Raise the version when you replace the files. */
var VERSION="life-planner-15";
var FILES=["./","index.html","manifest.webmanifest","icon-192.png","icon-512.png","icon-180.png"];
self.addEventListener("install",function(e){e.waitUntil(caches.open(VERSION).then(function(c){return c.addAll(FILES);}).then(function(){return self.skipWaiting();}));});
self.addEventListener("activate",function(e){e.waitUntil(caches.keys().then(function(k){return Promise.all(k.filter(function(n){return n!==VERSION;}).map(function(n){return caches.delete(n);}));}).then(function(){return self.clients.claim();}));});
self.addEventListener("fetch",function(e){
  if(e.request.method!=="GET")return;
  e.respondWith(fetch(e.request).then(function(r){
    if(r&&r.ok){var copy=r.clone();caches.open(VERSION).then(function(c){c.put(e.request,copy);});}
    return r;
  }).catch(function(){return caches.match(e.request).then(function(m){return m||caches.match("index.html");});}));
});
// Reminder pushes from the reminder service. The push carries no content, so the text is fixed here.
self.addEventListener("push",function(e){
  e.waitUntil(self.registration.showNotification("Life Planner",{body:"A few minutes for your goals, habits or journal today?",tag:"daily",icon:"icon-192.png",badge:"icon-192.png"}));
});
self.addEventListener("notificationclick",function(e){
  e.notification.close();
  e.waitUntil(self.clients.matchAll({type:"window",includeUncontrolled:true}).then(function(list){
    for(var i=0;i<list.length;i++){if("focus" in list[i])return list[i].focus();}
    return self.clients.openWindow("./");
  }));
});
