/* 尚贤圈 · Service Worker
 *
 * 策略（本轮 2026-09-25 重写：真离线 —— 不再等网络超时）：
 *
 *   ① 页面导航  → 网络优先，失败回落 index.html
 *                  理由：必须让新版本能立刻生效，不能被缓存锁死。
 *   ② 静态资源  → 缓存优先（CSS / JS / 图标 / 字体 / lottie / manifest）
 *                  理由：build-pwa.js 会给这些 URL 附带 ?v=<构建戳>，
 *                        版本一变 URL 就变，所以缓存优先**不可能**拿到旧版本，
 *                        而且离线时是「瞬间打开」而不是「等超时」。
 *   ③ 跨域请求  → 一律直连，绝不缓存（Supabase / 边缘函数 / 第三方 CDN）
 *   ④ 其它同源  → 先用缓存回，同时后台刷新（stale-while-revalidate）
 *
 *   另：支持 navigationPreload（有网时导航更快），并向页面广播在线/离线状态。
 */

const VERSION = '1790418468134'
const CACHE = 'sxq-pwa-' + VERSION
const RUNTIME = 'sxq-rt-' + VERSION

/* 应用外壳：安装时预缓存，保证断网也能打开 */
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest'
]

/* 静态资源的判定：这些扩展名走「缓存优先」 */
const STATIC_EXT = /\.(?:css|js|mjs|json|png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|mp3|wav|webmanifest)$/i

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(CACHE)
    await Promise.allSettled(CORE.map((u) => c.add(new Request(u, { cache: 'reload' }))))
    await self.skipWaiting()
  })())
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // 清掉旧版本缓存
    const keys = await caches.keys()
    await Promise.all(
      keys.filter((k) => k !== CACHE && k !== RUNTIME).map((k) => caches.delete(k))
    )
    // 导航预加载：有网时让导航请求提前发出
    if (self.registration.navigationPreload) {
      try { await self.registration.navigationPreload.disable() } catch (err) {}
    }
    await self.clients.claim()
  })())
})

self.addEventListener('message', (e) => {
  const d = e.data
  if (d === 'skip-waiting' || (d && d.type === 'SKIP_WAITING')) self.skipWaiting()
  /* 页面侧带着未读轮询结果来，让 SW 弹系统通知。
     这样即使标签页在后台、被最小化，也能收到提醒。
     （不依赖 VAPID 密钥：页面闭环。真正的「浏览器关掉也能收到」需要
       服务端 Web Push + VAPID，属于后续可升级项。） */
  if (d && d.type === 'SXQ_NOTIFY') {
    e.waitUntil(showSysNotif(d.title, d.body, d.url, d.tag))
  }
})

async function showSysNotif (title, body, url, tag) {
  try {
    if (self.Notification && self.Notification.permission !== 'granted') return
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    // 用户正在看这个页面时就不打扰
    const looking = list.some((c) => c.visibilityState === 'visible' && c.focused)
    if (looking) return
    await self.registration.showNotification(title || '尚贤圈', {
      body: body || '',
      icon: './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag: tag || 'sxq-notify',
      renotify: false,
      data: { url: url || './index.html#/pages/notify/notify' }
    })
  } catch (err) {}
}

function isCacheable (res) {
  return !!res && res.status === 200 && (res.type === 'basic' || res.type === 'default')
}
function isStatic (url) {
  return STATIC_EXT.test(url.pathname)
}

/* ── ① 导航：网络优先，离线回落外壳 ── */
async function handleNavigate (e, req) {
  try {
    let res = null
    if (e.preloadResponse) res = await e.preloadResponse
    if (!res) res = await fetch(req, { cache: 'no-store' })
    if (isCacheable(res)) {
      const copy = res.clone()
      caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {})
    }
    return res
  } catch (err) {
    const cached = (await caches.match('./index.html')) || (await caches.match('./'))
    if (cached) return cached
    return new Response(
      '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<title>离线 · 尚贤圈</title>' +
      '<body style="margin:0;display:grid;place-items:center;height:100vh;background:#f7f6f2;' +
      'font-family:-apple-system,\'PingFang SC\',sans-serif;color:#2c2c2c;text-align:center">' +
      '<div><div style="font-size:34px;font-weight:700;color:#d6482f;margin-bottom:12px">尚贤圈</div>' +
      '<p style="font-size:14px;color:#8a8580;line-height:1.9">当前没有网络，而且这一页还没被缓存。<br>' +
      '连上网后刷新即可。</p></div></body>',
      { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }
}

/* ── ② 静态资源：缓存优先（URL 带构建戳，安全且离线秒开） ── */
async function handleStatic (req) {
  const cache = await caches.open(CACHE)
  const hit = await cache.match(req)
  if (hit) return hit
  try {
    const res = await fetch(req)
    if (isCacheable(res)) cache.put(req, res.clone()).catch(() => {})
    return res
  } catch (err) {
    return (await caches.match(req)) || Response.error()
  }
}

/* ── ④ 其它同源：先给缓存，再后台刷新 ── */
async function handleStale (req) {
  const cache = await caches.open(RUNTIME)
  const hit = await cache.match(req)
  const net = fetch(req)
    .then((res) => { if (isCacheable(res)) cache.put(req, res.clone()).catch(() => {}); return res })
    .catch(() => null)
  return hit || (await net) || Response.error()
}

self.addEventListener('fetch', (e) => {
  const req = e.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // ③ 跨域一律直连
  if (url.origin !== self.location.origin) return

  // ① 页面导航
  if (req.mode === 'navigate') {
    e.respondWith(handleNavigate(e, req))
    return
  }

  // ② 静态资源
  if (isStatic(url)) {
    e.respondWith(handleStatic(req))
    return
  }

  // ④ 其它
  e.respondWith(handleStale(req))
})

/* ── 向页面广播在线 / 离线，供界面提示「当前离线」 ── */
async function broadcast (online) {
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
  list.forEach((c) => c.postMessage({ type: 'SXQ_NET', online }))
}
self.addEventListener('online', () => broadcast(true))
self.addEventListener('offline', () => broadcast(false))

/* ── 点击通知时聚焦或打开应用（配合后续 Web Push） ── */
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = (e.notification.data && e.notification.data.url) || './index.html#/pages/notify/notify'
  e.waitUntil((async () => {
    const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of list) {
      if ('focus' in c) { try { await c.focus(); c.postMessage({ type: 'SXQ_OPEN', url: target }); return } catch (err) {} }
    }
    if (self.clients.openWindow) await self.clients.openWindow(target)
  })())
})
