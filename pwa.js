/*! 尚贤圈网页版（PWA）· 启动引导 / 桌面三栏 / 历史与返回 / iOS 适配 / 安装 / SW
 *  ── 本轮（2026-09-25）修的问题：
 *     ① 安卓系统返回键与浏览器返回键不生效 → 接入 History，返回 = 应用内上一页
 *     ② PC 上那个「<」返回箭头既没用又占位 → PC 隐藏；手机上没历史时改回首页
 *     ③ 左栏用 emoji 图标（🔔）违反品牌规范 → 全部换成内联 SVG 线条图标
 *     ④ 右下角两个圆形按钮叠在一起 → 错开排列
 *     ⑤ iOS 地址栏收缩导致高度跳动 → dvh + 安全区
 *     ⑥ iOS 键盘遮挡输入框 → visualViewport 上推
 *     ⑦ PC 内容被拉得过宽 → 限宽居中
 *     ⑧ 首次使用无引导 → 四步轻引导（只弹一次）
 *     ⑨ 浏览器前进/后退、刷新保页、外链直达内页
 */
(function () {
  'use strict'

  var IS_DESKTOP = function () { return window.matchMedia('(min-width: 1024px)').matches }
  var IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.userAgent.indexOf('Macintosh') >= 0 && 'ontouchend' in document)
  var IS_STANDALONE = function () {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (navigator && navigator.standalone === true)
  }
  var EMAIL = (window.SXQ_AI && window.SXQ_AI.email) || 'sxcommunity@outlook.com'
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v) } catch (e) { return d } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)) } catch (e) {} }
  }

  var ROUTES = {
    home: '#/pages/index/index',
    msg: '#/pages/messages/messages',
    board: '#/pages/board/board',
    notify: '#/pages/notify/notify',
    mine: '#/pages/mine/mine',
    publish: '#/pages/publish/publish',
    search: '#/pages/search/search'
  }

  /* ═══════════ 0. 内联 SVG 线条图标（取代 emoji，符合品牌规范） ═══════════ */
  var SVG = {
    home: 'M4 20V9l8-5 8 5v11|M9 20v-6h6v6',
    msg: 'M4 5h16v11H8l-4 4z|M8 10h8',
    board: 'M4 4h7v7H4z|M13 4h7v7h-7z|M4 13h7v7H4z|M13 13h7v7h-7z',
    notify: 'M18 9a6 6 0 10-12 0c0 5-2 6-2 6h16s-2-1-2-6|M10.3 19a2 2 0 003.4 0',
    search: 'M11 4a7 7 0 100 14 7 7 0 000-14z|M20 20l-4-4',
    mine: 'M12 4.5a3.6 3.6 0 100 7.2 3.6 3.6 0 000-7.2z|M4.8 20.2a7.2 7.2 0 0114.4 0',
    publish: 'M12 5.5v13|M5.5 12h13'
  }
  function icon (name, size) {
    var d = SVG[name] || SVG.home
    var paths = d.split('|').map(function (p) {
      return '<path d="' + p + '"/>'
    }).join('')
    return '<svg viewBox="0 0 24 24" width="' + (size || 19) + '" height="' + (size || 19) + '" ' +
      'fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      paths + '</svg>'
  }

  /* ═══════════ 1. 首屏加载 ═══════════ */
  var loadEl = document.createElement('div')
  loadEl.className = 'sxq-load'
  loadEl.id = 'sxqLoad'
  loadEl.setAttribute('aria-hidden', 'true')
  loadEl.innerHTML = '<span class="sxq-lottie sxq-load-fx" data-lottie="loading" data-lottie-autoplay></span>' +
    '<span class="sxq-lottie sxq-load-hello" data-lottie="hello" data-lottie-autoplay></span>' +
    '<div class="sxq-load-txt">尚贤圈</div>'
  document.body.appendChild(loadEl)

  var loadT0 = Date.now(), loadDone = false
  function hideLoad () {
    if (loadDone) return
    loadDone = true
    var el = document.getElementById('sxqLoad')
    if (!el) return
    var wait = Math.max(0, 2600 - (Date.now() - loadT0))
    setTimeout(function () {
      el.classList.add('sxq-load-hide')
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el) }, 600)
    }, wait)
  }
  if (document.readyState === 'complete') hideLoad()
  else window.addEventListener('load', hideLoad)
  setTimeout(hideLoad, 10000)

  /* ═══════════ 2. 历史 / 返回键（核心修复） ═══════════
     背景：uni-app 的 hash 路由在部分浏览器/独立应用里不会自动产生可返回的历史，
     于是安卓系统返回键、浏览器返回键、iOS 左滑返回会直接退出应用或毫无反应。
     做法：给应用维护自己的历史栈 —— 每次路由变化压一条 {sxq:true} 状态；
     系统返回时若已到栈底，独立应用内就回首页而不是退出。 */
  var HISTORY_SENTINEL = 'sxq-root'
  function currentHash () { return location.hash || ROUTES.home }
  function isOurState (s) { return !!(s && s.sxq) }

  function pushOwnState () {
    try {
      history.pushState({ sxq: true, hash: currentHash(), t: Date.now() }, '', location.hash)
    } catch (e) {}
  }

  function initHistory () {
    // 首次进入：压一条哨兵，让「返回」有东西可退
    if (!isOurState(history.state)) {
      try { history.replaceState({ sxq: true, hash: currentHash(), root: HISTORY_SENTINEL }, '', location.hash) } catch (e) {}
    }
    pushOwnState()

    var lastHash = currentHash()
    window.addEventListener('hashchange', function () {
      if (currentHash() === lastHash) return
      lastHash = currentHash()
      pushOwnState()               // 每次应用内跳转都留一条记录
    })

    window.addEventListener('popstate', function (e) {
      var s = e.state
      if (isOurState(s)) {
        // 退到应用内某一条记录：让 uni 的 hash 路由自己响应（hash 已随之改变）
        lastHash = currentHash()
        return
      }
      // 已到栈底：再退就会离开应用
      if (IS_STANDALONE()) {
        // 独立应用里不该退出 —— 夹住，回首页
        try { history.pushState({ sxq: true, hash: ROUTES.home }, '', ROUTES.home) } catch (err) {}
        location.hash = ROUTES.home
        lastHash = ROUTES.home
      }
      // 浏览器标签页里则允许正常离开（符合用户预期）
    })
  }

  /* ═══════════ 3. PC 上隐藏「<」返回箭头，手机上没历史时改回首页 ═══════════ */
  function fixBackArrow () {
    // PC：隐藏 uni 的导航返回区（那是手机习惯，PC 上既没用又占位）
    document.body.classList.toggle('sxq-desktop', IS_DESKTOP())
    // 手机：若应用内没有可返回的上一页，让返回按钮回首页而不是点了没反应
    document.addEventListener('click', function (e) {
      var btn = e.target.closest && e.target.closest('.uni-page-head-btn, .uni-page-head-hd')
      if (!btn) return
      if (IS_DESKTOP()) { e.preventDefault(); e.stopPropagation(); return }
      // 判断是否还有应用内历史：我们自己压的条数
      var depth = 0
      try { depth = history.length } catch (err) { depth = 99 }
      if (depth <= 2) {
        e.preventDefault(); e.stopPropagation()
        location.hash = ROUTES.home
      }
    }, true)
  }

  /* ═══════════ 4. 桌面三栏 ═══════════ */
  var MENU = [
    { label: '首页', href: ROUTES.home, icon: 'home' },
    { label: '消息', href: ROUTES.msg, icon: 'msg' },
    { label: '版块', href: ROUTES.board, icon: 'board' },
    { label: '通知', href: ROUTES.notify, icon: 'notify' },
    { label: '搜索', href: ROUTES.search, icon: 'search' },
    { label: '我的', href: ROUTES.mine, icon: 'mine' }
  ]

  function buildSide () {
    if (document.querySelector('.sxq-side')) return
    var collapsed = LS.get('sxq_side_collapsed', false)
    var side = document.createElement('aside')
    side.className = 'sxq-side' + (collapsed ? ' collapsed' : '')
    side.setAttribute('aria-label', '主导航')
    side.innerHTML =
      '<div class="sxq-brand">' +
        '<span class="seal">贤</span>' +
        '<span class="sxq-brand-t"><b>尚贤圈</b><small>SHANGXIAN QUAN</small></span>' +
      '</div>' +
      '<button class="sxq-collapse" type="button" aria-label="收起侧栏" title="收起 / 展开侧栏">' +
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" ' +
        'stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>' +
      '</button>' +
      '<nav class="sxq-menu">' +
        MENU.map(function (m) {
          return '<a href="' + m.href + '" data-nav="' + m.href + '" title="' + m.label + '">' +
            '<span class="sxq-ic">' + icon(m.icon) + '</span>' +
            '<span class="sxq-lb">' + m.label + '</span></a>'
        }).join('') +
      '</nav>' +
      '<a class="sxq-publish" href="' + ROUTES.publish + '" data-nav="' + ROUTES.publish + '">' +
        '<span class="sxq-ic">' + icon('publish', 17) + '</span><span class="sxq-lb">发布</span>' +
      '</a>'
    document.body.insertBefore(side, document.body.firstChild)

    var col = side.querySelector('.sxq-collapse')
    col.addEventListener('click', function () {
      var now = side.classList.toggle('collapsed')
      LS.set('sxq_side_collapsed', now)
      document.body.classList.toggle('sxq-side-collapsed', now)
    })
    if (collapsed) document.body.classList.add('sxq-side-collapsed')
  }

  function buildRail () {
    if (document.querySelector('.sxq-rail')) return
    var rail = document.createElement('aside')
    rail.className = 'sxq-rail'
    rail.setAttribute('aria-label', '侧边信息')
    rail.innerHTML =
      '<div class="card"><h5>快捷入口</h5><div class="quick">' +
        '<a href="' + ROUTES.publish + '">发布内容</a>' +
        '<a href="' + ROUTES.search + '">搜索</a>' +
        '<a href="https://kernthal.github.io/shangxianquan-official/" target="_blank" rel="noopener">官方网站</a>' +
        '<a href="https://kernthal.github.io/shangxianquan-official/#rules" target="_blank" rel="noopener">规则中心</a>' +
      '</div></div>' +
      '<div class="card"><h5>六大版块</h5><ul>' +
        ['树洞 · 匿名倾诉', '求助 · 有问必答', '二手 · 闲置流转',
         '社团 · 找到同好', '学习 · 一起变强', '闲聊 · 快乐就完了'].map(function (t) {
          return '<li><a href="' + ROUTES.home + '">' + t + '</a></li>'
        }).join('') +
      '</ul></div>' +
      '<div class="card"><h5>需要帮助？</h5><p class="muted" style="margin:0;line-height:1.7">' +
        '右下角智能客服可解答产品与校园常见问题。详细问题请发邮件 ' + EMAIL + '。</p></div>' +
      '<div class="card"><span class="sxq-lottie rail-hello" data-lottie="hello" data-lottie-autoplay></span>' +
        '<p class="muted" style="margin:8px 0 0;line-height:1.7">出品 · Kernthal Studio<br>SX Campus Community</p></div>'
    document.body.appendChild(rail)
  }

  /* 键盘快捷键（只做最基本的两个） */
  function initKeys () {
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        var inst = document.querySelector('.sxq-install'); if (inst) inst.remove()
        return
      }
      if (e.key === '/' && !/^(INPUT|TEXTAREA)$/.test((e.target.tagName || '')) && !e.target.isContentEditable) {
        e.preventDefault()
        location.hash = ROUTES.search
      }
    })
  }

  /* ═══════════ 5. PC 宽度解锁与内容限宽 ═══════════ */
  function unlockWidth (on) {
    var h = document.documentElement, b = document.body
    if (!h || !b) return
    if (on) {
      h.style.setProperty('max-width', 'none', 'important')
      h.style.setProperty('width', 'auto', 'important')
      h.style.setProperty('margin', '0', 'important')
      b.style.setProperty('max-width', 'none', 'important')
      b.style.setProperty('width', 'auto', 'important')
    } else {
      h.style.removeProperty('max-width'); h.style.removeProperty('width'); h.style.removeProperty('margin')
      b.style.removeProperty('max-width'); b.style.removeProperty('width')
    }
  }

  function applyLayout () {
    var desktop = IS_DESKTOP()
    document.body.classList.toggle('sxq-desktop', desktop)
    document.body.classList.toggle('sxq-ios', IS_IOS)
    document.documentElement.classList.toggle('sxq-standalone', IS_STANDALONE())
    if (desktop) {
      unlockWidth(true)
      buildSide()
      buildRail()
      document.body.classList.remove('sxq-has-tabbar')
    } else {
      unlockWidth(false)
      document.body.classList.add('sxq-has-tabbar')
    }
    if (window.SXQ_NAV && window.SXQ_NAV.refresh) window.SXQ_NAV.refresh()
    if (window.SXQ_LOTTIE && window.SXQ_LOTTIE.refresh) window.SXQ_LOTTIE.refresh()
  }
  applyLayout()
  setTimeout(applyLayout, 300)
  setTimeout(applyLayout, 1200)
  var rt
  window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(applyLayout, 250) })

  /* ═══════════ 6. iOS：可视视口高度 + 键盘不遮输入框 ═══════════ */
  function initViewportFix () {
    var root = document.documentElement
    var vv = window.visualViewport
    function apply () {
      // 键盘占掉的高度写进 --sxq-kb，供 CSS 上推底栏与输入框
      if (vv) {
        var kb = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
        root.style.setProperty('--sxq-kb', kb + 'px')
        root.style.setProperty('--sxq-vvh', Math.round(vv.height) + 'px')
      }
    }
    if (vv) {
      vv.addEventListener('resize', apply)
      vv.addEventListener('scroll', apply)
      apply()
    }
    // 聚焦输入框时滚进视野中央（等键盘动画结束）
    document.addEventListener('focusin', function (e) {
      var t = e.target
      if (!t || !/^(INPUT|TEXTAREA)$/.test(t.tagName)) return
      setTimeout(function () {
        try { t.scrollIntoView({ block: 'center', behavior: 'smooth' }) } catch (err) { try { t.scrollIntoView() } catch (e2) {} }
      }, 300)
    })
    document.addEventListener('focusout', function () { setTimeout(apply, 150) })
  }

  /* ═══════════ 7. Service Worker ═══════════ */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {})
    })
  }

  /* ═══════════ 8. 安装引导 ═══════════ */
  function showInstall (html, btnText, onClick, closeText) {
    if (document.querySelector('.sxq-install')) return
    var el = document.createElement('div')
    el.className = 'sxq-install show'
    el.innerHTML = '<div class="sxq-install-txt">' + html + '</div>' +
      '<div class="sxq-install-acts">' +
        '<button class="sxq-install-btn" type="button">' + btnText + '</button>' +
        (closeText ? '<button class="sxq-install-later" type="button">' + closeText + '</button>' : '') +
      '</div>' +
      '<button class="sxq-install-close" type="button" aria-label="关闭">×</button>'
    document.body.appendChild(el)
    el.querySelector('.sxq-install-close').addEventListener('click', function () { el.remove() })
    var later = el.querySelector('.sxq-install-later')
    if (later) later.addEventListener('click', function () { LS.set('sxq_install_later', Date.now()); el.remove() })
    el.querySelector('.sxq-install-btn').addEventListener('click', function () {
      if (onClick) onClick(); else el.remove()
    })
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault()
    if (IS_STANDALONE()) return
    var later = LS.get('sxq_install_later', 0)
    if (later && Date.now() - later < 7 * 86400000) return
    showInstall('把<b>尚贤圈</b>安装到桌面，像 App 一样打开：没有地址栏、可离线、能收推送。',
      '立即安装', function () {
        e.prompt()
        e.userChoice && e.userChoice.then(function () {
          var el = document.querySelector('.sxq-install'); if (el) el.remove()
        })
      }, '以后再说')
  })

  /* iOS Safari 不支持 beforeinstallprompt，给手把手图文指引（一周只弹一次） */
  var ua = navigator.userAgent || ''
  var isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua)
  if (IS_IOS && isSafari && !IS_STANDALONE()) {
    setTimeout(function () {
      var seen = LS.get('sxq_ios_install_hint', 0)
      if (seen && Date.now() - seen < 7 * 86400000) return
      showInstall(
        '把<b>尚贤圈</b>加到主屏幕，像 App 一样用：<br>' +
        '① 点 Safari 底部中间的「分享」按钮<br>' +
        '② 往下滑找到「<b>添加到主屏幕</b>」<br>' +
        '③ 点右上角「添加」，桌面就会出现图标',
        '知道了', function () {
          LS.set('sxq_ios_install_hint', Date.now())
          var el = document.querySelector('.sxq-install'); if (el) el.remove()
        })
    }, 8000)
  }

  /* ═══════════ 9. 首次使用的四步轻引导（只弹一次，仅 PC） ═══════════ */
  var TOUR = [
    { t: '左侧导航', d: '首页 / 消息 / 版块 / 通知 / 搜索 / 我的 都在左边。最下方红色的「发布」随时可以发帖。' },
    { t: '右侧信息栏', d: '快捷入口、六大版块、帮助入口都在右边。窄屏时它会自动收起。' },
    { t: '搜索与快捷键', d: '按 <kbd>/</kbd> 直接跳到搜索，按 <kbd>Esc</kbd> 关闭任何弹窗。' },
    { t: '装到桌面', d: '想更顺一点？把尚贤圈装到桌面，就没有地址栏、还能离线用。' }
  ]
  function initTour () {
    if (!IS_DESKTOP()) return
    if (LS.get('sxq_tour_done', 0)) return
    if (document.querySelector('.sxq-tour')) return
    var i = 0
    var box = document.createElement('div')
    box.className = 'sxq-tour show'
    document.body.appendChild(box)
    function paint () {
      var s = TOUR[i]
      box.innerHTML =
        '<div class="sxq-tour-n">' + (i + 1) + ' / ' + TOUR.length + '</div>' +
        '<b>' + s.t + '</b><p>' + s.d + '</p>' +
        '<div class="sxq-tour-acts">' +
          '<button class="sxq-tour-skip">跳过</button>' +
          '<button class="sxq-tour-next">' + (i === TOUR.length - 1 ? '开始使用' : '下一步') + '</button>' +
        '</div>'
      box.querySelector('.sxq-tour-skip').onclick = done
      box.querySelector('.sxq-tour-next').onclick = function () {
        if (i < TOUR.length - 1) { i++; paint() } else done()
      }
    }
    function done () { LS.set('sxq_tour_done', 1); box.classList.remove('show'); setTimeout(function () { box.remove() }, 400) }
    paint()
  }

  /* ═══════════ 11. 分享目标：从系统分享面板直接发到尚贤圈 ═══════════
     manifest 里配了 share_target（GET），系统分享文字/链接进来时
     会带 ?title=&text=&url= 到 index.html。这里接住并带去发布页。 */
  function initShareTarget () {
    var q
    try { q = new URLSearchParams(location.search) } catch (e) { return }
    var title = q.get('title') || '', text = q.get('text') || '', url = q.get('url') || ''
    if (!title && !text && !url) return
    var payload = [title, text, url].filter(Boolean).join('\n').trim()
    try { sessionStorage.setItem('sxq_share', payload) } catch (e) {}
    // 清掉地址栏里的参数，免得刷新又触发一次
    try { history.replaceState(history.state, '', location.pathname + location.hash) } catch (e) {}
    // 进发布页，并尽力把内容填进输入框
    location.hash = ROUTES.publish
    var tries = 0
    var timer = setInterval(function () {
      tries++
      if (tries > 24) { clearInterval(timer); tipShare(payload); return }
      var box = document.querySelector('textarea, .uni-textarea-textarea, uni-textarea textarea')
      if (!box) return
      clearInterval(timer)
      try {
        box.focus()
        box.value = payload
        box.dispatchEvent(new Event('input', { bubbles: true }))
        box.dispatchEvent(new Event('change', { bubbles: true }))
        tipShare('已带入分享内容，检查一下再发布')
      } catch (e) { tipShare(payload) }
    }, 250)
    function tipShare (p) {
      showInstall('已收到系统分享的内容。若没有自动填入，长按下面的文字复制：<br>' +
        '<span style="display:block;margin-top:6px;padding:8px 10px;background:#f7f6f2;border-radius:8px;' +
        'word-break:break-all;max-height:120px;overflow:auto">' + escapeHtml(p) + '</span>', '知道了')
    }
  }
  function escapeHtml (s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    })
  }

  /* ═══════════ 12.5 系统通知（后台也能弹） ═══════════
     路径：页面拿到「有新消息」→ postMessage 给 SW → SW 调 showNotification。
     用户在看着页面时不打扰（SW 里判断 visibility）。
     ⚠️ 这不是「浏览器关掉也能收到」的真正 Web Push（那需要服务端 VAPID），
        但覆盖了「标签页在后台/最小化」这个最常见场景，且不需要任何密钥。 */
  function initNotifyBridge () {
    if (!('Notification' in window) || !navigator.serviceWorker) return

    var KEY = 'sxq_notify_ask'
    function ask () {
      try {
        if (Notification.permission !== 'default') return
        if (LS.get(KEY, 0) && Date.now() - LS.get(KEY, 0) < 7 * 86400000) return
      } catch (e) {}
      if (document.querySelector('.sxq-install')) return    // 别和安装引导打架
      showInstall(
        '开启<b>消息提醒</b>？有新回复或系统公告时，即使切到别的页面也会提醒你。',
        '开启提醒', function () {
          LS.set(KEY, Date.now())
          try {
            Notification.requestPermission().then(function (p) {
              var el = document.querySelector('.sxq-install'); if (el) el.remove()
              if (p === 'granted') notify('尚贤圈', '提醒已开启，有新消息会通知你', './index.html#/pages/notify/notify')
              else note('已跳过，随时可在设置里开启')
            })
          } catch (e) { var el = document.querySelector('.sxq-install'); if (el) el.remove() }
        }, '以后再说')
    }
    // 装到桌面之后再问，体验更自然
    setTimeout(function () { if (IS_STANDALONE()) ask(); else setTimeout(ask, 20000) }, 6000)

    // 给应用层用的桥：window.SXQ_NOTIFY('标题','正文', '跳转地址')
    window.SXQ_NOTIFY = function (title, body, url) { notify(title, body, url) }
    // 兜底：标题被加上未读标记（如 «(1) 尚贤圈»）时也提醒一次
    var lastTitle = document.title
    setInterval(function () {
      if (document.title === lastTitle) return
      var had = /[（(]\d+[)）]/.test(lastTitle)
      var has = /[（(]\d+[)）]/.test(document.title)
      lastTitle = document.title
      if (!had && has) notify('尚贤圈有新消息', document.title.replace(/[（(]\d+[)）]\s*/, ''), './index.html#/pages/notify/notify')
    }, 5000)
  }
  function notify (title, body, url) {
    try {
      if (!('Notification' in window) || Notification.permission !== 'granted') return
      if (!navigator.serviceWorker || !navigator.serviceWorker.controller) return
      navigator.serviceWorker.controller.postMessage({ type: 'SXQ_NOTIFY', title: title, body: body, url: url })
    } catch (e) {}
  }
  /* pwa.js 里没有全局 toast，用顶部小条代替 */
  function note (text) {
    try {
      var el = document.querySelector('.sxq-net')
      if (!el) { el = document.createElement('div'); el.className = 'sxq-net'; document.body.appendChild(el) }
      el.textContent = text
      el.classList.remove('off')
      el.classList.add('show')
      clearTimeout(note._t)
      note._t = setTimeout(function () { el.classList.remove('show') }, 3000)
    } catch (e) {}
  }

  /* ═══════════ 12. 在线 / 离线状态提示 ═══════════ */
  function initNetHint () {    var bar = null
    function paint (online) {
      if (!bar) {
        bar = document.createElement('div')
        bar.className = 'sxq-net'
        document.body.appendChild(bar)
      }
      bar.textContent = online ? '已恢复网络' : '当前离线 · 可继续浏览已缓存的内容'
      bar.classList.toggle('off', !online)
      bar.classList.add('show')
      clearTimeout(paint._t)
      paint._t = setTimeout(function () { bar.classList.remove('show') }, online ? 2600 : 6000)
    }
    window.addEventListener('online', function () { paint(true) })
    window.addEventListener('offline', function () { paint(false) })
    if (navigator.serviceWorker) {
      navigator.serviceWorker.addEventListener('message', function (e) {
        var d = e.data
        if (d && d.type === 'SXQ_NET') paint(!!d.online)
        if (d && d.type === 'SXQ_OPEN' && d.url) location.href = d.url
      })
    }
    if (!navigator.onLine) paint(false)
  }

  /* ═══════════ 10. 启动 ═══════════ */
  initHistory()
  fixBackArrow()
  initViewportFix()
  initKeys()
  initShareTarget()
  initNetHint()
  initNotifyBridge()
  // 等加载页播完再弹引导，避免叠在一起
  setTimeout(initTour, 3600)

  // 暴露给其他模块（如 sxq-nav / sxq-ai-chat 需要用同一套路由）
  window.SXQ_PWA = {
    routes: ROUTES,
    icon: icon,
    go: function (hash) { location.hash = hash }
  }
})()
