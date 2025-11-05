/*
  Lightweight Debug Panel for A-Frame + AR.js demos
  - Floating toggle button (bottom-left)
  - Tabs: Logs, Stats (FPS), Markers (markerFound/markerLost)
  - Console capture (log/warn/error) with restore on unload
  - Safe to load even if A-Frame/AR.js aren't present
*/

(function () {
  if (window.__AR_DEBUG_PANEL__) return; // singleton guard
  window.__AR_DEBUG_PANEL__ = true;

  var state = {
    isOpen: false,
    logs: [],
    maxLogs: 500,
    activeTab: 'logs', // 'logs' | 'stats' | 'markers'
    fps: 0,
    rafId: null,
    lastFrameTime: performance.now(),
    frameCount: 0,
    visibleMarkerIds: new Set(),
    unsubscribers: [],
    originalConsole: {
      log: console.log,
      warn: console.warn,
      error: console.error
    }
  };

  // DOM helpers
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'style' && typeof attrs[k] === 'object') {
          Object.assign(node.style, attrs[k]);
        } else if (k === 'class') {
          node.className = attrs[k];
        } else if (k.startsWith('on') && typeof attrs[k] === 'function') {
          node.addEventListener(k.slice(2), attrs[k]);
        } else {
          node.setAttribute(k, attrs[k]);
        }
      });
    }
    if (children) {
      if (Array.isArray(children)) {
        children.forEach(function (c) { if (c) node.appendChild(c); });
      } else if (typeof children === 'string') {
        node.textContent = children;
      } else if (children instanceof Node) {
        node.appendChild(children);
      }
    }
    return node;
  }

  // Basic styles
  var style = el('style', null, "\n.__ar_dbg_toggle{position:fixed;left:12px;bottom:12px;z-index:2147483000;background:#111;color:#fff;border:1px solid #333;border-radius:6px;padding:8px 10px;font:12px/1.2 system-ui,Segoe UI,Roboto,Helvetica,Arial,Apple Color Emoji,Segoe UI Emoji;cursor:pointer;opacity:.8}.__ar_dbg_toggle:hover{opacity:1}\n.__ar_dbg_panel{position:fixed;left:12px;bottom:48px;width:340px;max-height:55vh;z-index:2147483000;background:#0b0b0c;color:#f2f2f2;border:1px solid #333;border-radius:8px;box-shadow:0 6px 24px rgba(0,0,0,.35);display:none;overflow:hidden;font:12px/1.3 system-ui,Segoe UI,Roboto,Helvetica,Arial}\n.__ar_dbg_header{display:flex;align-items:center;justify-content:space-between;background:#141416;border-bottom:1px solid #2a2a2e;padding:6px 8px;cursor:move}\n.__ar_dbg_tabs{display:flex;gap:6px}\n.__ar_dbg_tab{padding:4px 8px;border:1px solid #2a2a2e;border-radius:5px;background:#1a1b1e;color:#d9d9dc;cursor:pointer}.__ar_dbg_tab.__active{background:#2a2b30;color:#fff;border-color:#3a3b40}\n.__ar_dbg_body{background:#0f1012;padding:8px;overflow:auto;max-height:calc(55vh - 38px)}\n.__ar_dbg_logs{white-space:pre-wrap;font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace;font-size:11px}\n.__ar_dbg_log.__info{color:#cfe3ff}\n.__ar_dbg_log.__warn{color:#ffe08a}\n.__ar_dbg_log.__error{color:#ffb0b0}\n.__ar_dbg_row{display:flex;align-items:center;justify-content:space-between;gap:8px}\n.__ar_dbg_stat{font-family:ui-monospace,SFMono-Regular,Consolas,Menlo,monospace}\n.__ar_dbg_marker{display:inline-block;margin:2px 6px 2px 0;padding:2px 6px;border-radius:4px;background:#1e2127;border:1px solid #343840}\n");
  document.head.appendChild(style);

  // UI Elements
  var toggleBtn = el('button', { class: '__ar_dbg_toggle', onclick: onToggle }, 'Debug');
  var panel = el('div', { class: '__ar_dbg_panel' });
  var header = el('div', { class: '__ar_dbg_header' });
  var title = el('div', null, 'Debug Panel');
  var tabs = el('div', { class: '__ar_dbg_tabs' });
  var tabLogs = el('button', { class: '__ar_dbg_tab __active', onclick: function () { switchTab('logs'); } }, 'Logs');
  var tabStats = el('button', { class: '__ar_dbg_tab', onclick: function () { switchTab('stats'); } }, 'Stats');
  var tabMarkers = el('button', { class: '__ar_dbg_tab', onclick: function () { switchTab('markers'); } }, 'Markers');
  tabs.appendChild(tabLogs); tabs.appendChild(tabStats); tabs.appendChild(tabMarkers);
  header.appendChild(title); header.appendChild(tabs);
  var body = el('div', { class: '__ar_dbg_body' });
  var logsView = el('div', { class: '__ar_dbg_logs' });
  var statsView = el('div');
  var markersView = el('div');
  body.appendChild(logsView);
  body.appendChild(statsView);
  body.appendChild(markersView);
  panel.appendChild(header);
  panel.appendChild(body);
  document.body.appendChild(toggleBtn);
  document.body.appendChild(panel);

  // Draggable header
  (function makeDraggable(handle, target) {
    var startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false;
    handle.addEventListener('mousedown', onDown);
    function onDown(e) {
      dragging = true;
      startX = e.clientX; startY = e.clientY;
      var rect = target.getBoundingClientRect();
      startLeft = rect.left; startTop = rect.top;
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    }
    function onMove(e) {
      if (!dragging) return;
      var dx = e.clientX - startX;
      var dy = e.clientY - startY;
      target.style.left = Math.max(4, startLeft + dx) + 'px';
      target.style.bottom = 'auto';
      target.style.top = Math.max(4, startTop + dy) + 'px';
    }
    function onUp() {
      dragging = false;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
  })(header, panel);

  // Tab switching
  function switchTab(tab) {
    state.activeTab = tab;
    tabLogs.classList.toggle('__active', tab === 'logs');
    tabStats.classList.toggle('__active', tab === 'stats');
    tabMarkers.classList.toggle('__active', tab === 'markers');
    logsView.style.display = tab === 'logs' ? 'block' : 'none';
    statsView.style.display = tab === 'stats' ? 'block' : 'none';
    markersView.style.display = tab === 'markers' ? 'block' : 'none';
  }
  switchTab('logs');

  // Toggle
  function onToggle() {
    state.isOpen = !state.isOpen;
    panel.style.display = state.isOpen ? 'block' : 'none';
  }

  // Console capture
  function pushLog(level, args) {
    try {
      var time = new Date().toISOString().split('T')[1].replace('Z', '');
      var text = Array.prototype.map.call(args, stringify).join(' ');
      state.logs.push({ level: level, text: '[' + time + '] ' + text });
      if (state.logs.length > state.maxLogs) state.logs.shift();
      if (state.activeTab === 'logs') renderLogs();
    } catch (_) {}
  }
  function stringify(v) {
    if (v instanceof Error) return v.stack || (v.name + ': ' + v.message);
    if (typeof v === 'object') {
      try { return JSON.stringify(v); } catch (_) { return '[Object]'; }
    }
    return String(v);
  }
  console.log = function () { state.originalConsole.log.apply(console, arguments); pushLog('info', arguments); };
  console.warn = function () { state.originalConsole.warn.apply(console, arguments); pushLog('warn', arguments); };
  console.error = function () { state.originalConsole.error.apply(console, arguments); pushLog('error', arguments); };
  window.addEventListener('beforeunload', function () {
    console.log = state.originalConsole.log;
    console.warn = state.originalConsole.warn;
    console.error = state.originalConsole.error;
  });

  function renderLogs() {
    if (!logsView) return;
    var frag = document.createDocumentFragment();
    state.logs.slice(-300).forEach(function (l) {
      var line = el('div', { class: '__ar_dbg_log __' + mapLevel(l.level) }, l.text);
      frag.appendChild(line);
    });
    logsView.innerHTML = '';
    logsView.appendChild(frag);
    logsView.scrollTop = logsView.scrollHeight;
  }
  function mapLevel(level) {
    if (level === 'warn') return 'warn';
    if (level === 'error') return 'error';
    return 'info';
  }

  // FPS tracking
  function startFps() {
    var lastSec = performance.now();
    state.frameCount = 0;
    function loop(now) {
      state.frameCount++;
      if (now - lastSec >= 1000) {
        state.fps = state.frameCount;
        state.frameCount = 0;
        lastSec = now;
        if (state.activeTab === 'stats') renderStats();
      }
      state.rafId = requestAnimationFrame(loop);
    }
    state.rafId = requestAnimationFrame(loop);
  }
  function stopFps() { if (state.rafId) cancelAnimationFrame(state.rafId); }
  function renderStats() {
    statsView.innerHTML = '';
    var row = el('div', { class: '__ar_dbg_row' }, [
      el('div', null, 'FPS'),
      el('div', { class: '__ar_dbg_stat' }, String(state.fps))
    ]);
    statsView.appendChild(row);
  }

  // Marker tracking (A-Frame + AR.js)
  function setupMarkerTracking() {
    try {
      var scene = document.querySelector('a-scene');
      if (!scene) return;

      // Listen for arjs events if available
      var onReady = function () { pushLog('info', ['arReady']); };
      var onError = function (e) { pushLog('error', ['arError', e && (e.detail || e.message || e)]); };
      scene.addEventListener('arReady', onReady);
      scene.addEventListener('arError', onError);
      state.unsubscribers.push(function () {
        scene.removeEventListener('arReady', onReady);
        scene.removeEventListener('arError', onError);
      });

      // Markers
      var markers = Array.prototype.slice.call(scene.querySelectorAll('a-marker'));
      markers.forEach(function (m) {
        var id = markerId(m);
        var onFound = function () { state.visibleMarkerIds.add(id); pushLog('info', ['markerFound', id]); if (state.activeTab === 'markers') renderMarkers(); };
        var onLost = function () { state.visibleMarkerIds.delete(id); pushLog('info', ['markerLost', id]); if (state.activeTab === 'markers') renderMarkers(); };
        m.addEventListener('markerFound', onFound);
        m.addEventListener('markerLost', onLost);
        state.unsubscribers.push(function () {
          m.removeEventListener('markerFound', onFound);
          m.removeEventListener('markerLost', onLost);
        });
      });

      renderMarkers();
    } catch (e) {
      pushLog('error', ['setupMarkerTracking failed', e]);
    }
  }
  function markerId(markerEl) {
    var type = markerEl.getAttribute('type') || 'unknown';
    var value = markerEl.getAttribute('value');
    var idAttr = markerEl.getAttribute('id');
    return idAttr || (type + ':' + (value != null ? value : '?'));
  }
  function renderMarkers() {
    markersView.innerHTML = '';
    if (!state.visibleMarkerIds.size) {
      markersView.appendChild(el('div', null, 'No markers visible'));
      return;
    }
    state.visibleMarkerIds.forEach(function (id) {
      markersView.appendChild(el('span', { class: '__ar_dbg_marker' }, String(id)));
    });
  }

  // Public API
  window.ARDebug = {
    open: function () { if (!state.isOpen) onToggle(); },
    close: function () { if (state.isOpen) onToggle(); },
    log: function () { pushLog('info', arguments); },
    warn: function () { pushLog('warn', arguments); },
    error: function () { pushLog('error', arguments); }
  };

  // Initialize
  startFps();
  setupMarkerTracking();
  renderLogs();
  renderStats();
  renderMarkers();
})();


