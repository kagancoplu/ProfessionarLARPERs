/*
 * Boot guard (a classic script, before the app's module). If the app has drawn nothing after a while — a module
 * that failed to load or evaluate, a boot that never finished, a crash that unmounted React — show what went wrong
 * instead of an empty page, with a way out. Plain DOM, no dependencies; CSP-safe (a file, not inline).
 */
(function () {
  var errors = []
  var note = function (msg) { if (msg && errors.length < 8) errors.push(String(msg).slice(0, 400)) }
  window.addEventListener('error', function (e) { note(e.error && e.error.stack ? e.error.stack.split('\n').slice(0, 3).join(' / ') : e.message || (e.target && e.target.src ? 'failed to load ' + e.target.src : '')) }, true)
  window.addEventListener('unhandledrejection', function (e) { var r = e.reason; note(r && r.stack ? r.stack.split('\n').slice(0, 3).join(' / ') : r) })
  var origError = console.error
  console.error = function () { try { note([].map.call(arguments, function (a) { return a && a.message ? a.name + ': ' + a.message : String(a) }).join(' ')) } catch (_) {} return origError.apply(console, arguments) }
  var check = function (final) {
    var root = document.getElementById('root')
    if (!root || root.childElementCount > 0) return
    if (!final) { setTimeout(function () { check(true) }, 6000); return }
    var box = document.createElement('div')
    box.setAttribute('data-testid', 'boot-guard')
    box.style.cssText = 'max-width:720px;margin:48px auto;padding:20px;font:15px/1.5 system-ui,sans-serif;color:#3f2832;background:#fff8e7;border:3px solid #3f2832'
    var h = document.createElement('p'); h.style.cssText = 'font-weight:700;font-size:18px;margin:0 0 8px'
    h.textContent = 'The town did not open in this browser.'
    var p = document.createElement('p'); p.style.margin = '0 0 8px'
    p.textContent = errors.length ? 'What the browser reported:' : 'The browser reported no error. Reload the page, or open the mock walkthrough.'
    box.appendChild(h); box.appendChild(p)
    if (errors.length) { var pre = document.createElement('pre'); pre.style.cssText = 'white-space:pre-wrap;font-size:12px;background:#f3e5c8;padding:8px;margin:0 0 12px'; pre.textContent = errors.join('\n'); box.appendChild(pre) }
    var links = document.createElement('p'); links.style.margin = '0'
    var a = function (href, text) { var l = document.createElement('a'); l.href = href; l.textContent = text; l.style.marginRight = '16px'; links.appendChild(l) }
    a(location.pathname + location.search, 'Reload')
    a('/?mode=mock', 'Open the mock walkthrough')
    box.appendChild(links)
    root.appendChild(box)
  }
  setTimeout(function () { check(false) }, 8000)
})()
