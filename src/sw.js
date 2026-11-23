const V='posewear-v9';self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>c.addAll(/* BUILD_PRECACHE */ [])))});
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!=V).map(k=>caches.delete(k))))));
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(u.origin!=location.origin||u.pathname.startsWith('/api/')||e.request.method!='GET')return;
 // フォントは内容ごとに別のURLになるため、一度保存した同じ版をオフラインでも使える。
 if(u.pathname.startsWith('/assets/')&&u.pathname.endsWith('.woff2')){
  e.respondWith(caches.match(e.request).then(cached=>cached||fetch(e.request)));return;
 }
 const img=/\/(p|c)\/(t|i|m)\//.test(u.pathname);e.respondWith(img?caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const cl=res.clone();caches.open(V+'-img').then(c=>c.put(e.request,cl));return res}))
 :fetch(e.request).then(res=>{const cl=res.clone();caches.open(V).then(c=>c.put(e.request,cl));return res}).catch(()=>caches.match(e.request)))});
