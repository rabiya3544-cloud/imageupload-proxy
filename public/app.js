'use strict';

(function(global) {
  var PROXY_BASE = 'https://imageupload-proxy.vercel.app';
  var AUTH_URL = PROXY_BASE + '/api/auth';
  var API_BASE = 'https://imageupload.app/api/1';
  var MAX_FILE_SIZE = 32 * 1024 * 1024;

  /* ================================================================
   * LocalStore
   * ================================================================ */
  function LocalStore(options) {
    this.key = (options && options.key) || 'imageupload_gallery_v1';
  }
  LocalStore.prototype.load = function() {
    try { return JSON.parse(localStorage.getItem(this.key) || '[]'); }
    catch (e) { return []; }
  };
  LocalStore.prototype.save = function(items) {
    localStorage.setItem(this.key, JSON.stringify(items));
  };
  LocalStore.prototype.add = function(item) {
    var a = this.load();
    a.unshift(item);
    this.save(a);
  };
  LocalStore.prototype.remove = function(id) {
    this.save(this.load().filter(function(x) { return x.id !== id; }));
  };
  LocalStore.prototype.clear = function() {
    localStorage.removeItem(this.key);
  };

  /* ================================================================
   * PendingSync
   * ================================================================ */
  function PendingSync(options) {
    this.key = (options && options.key) || 'imageupload_pending_sync';
  }
  PendingSync.prototype.load = function() {
    try { return JSON.parse(localStorage.getItem(this.key) || '[]'); }
    catch (e) { return []; }
  };
  PendingSync.prototype.save = function(items) {
    localStorage.setItem(this.key, JSON.stringify(items));
  };
  PendingSync.prototype.add = function(item) {
    var a = this.load();
    if (a.some(function(x) { return x.id === item.id; })) return;
    a.push(item);
    this.save(a);
  };
  PendingSync.prototype.remove = function(id) {
    this.save(this.load().filter(function(x) { return x.id !== id; }));
  };
  PendingSync.prototype.clear = function() {
    localStorage.removeItem(this.key);
  };

  /* ================================================================
   * BlobUtils
   * ================================================================ */
  function BlobUtils() {}

  BlobUtils.prototype.getFileNameFromPath = function(p) {
    return (p || '').replace(/^.*\//, '');
  };

  BlobUtils.prototype.formatFileSize = function(b) {
    if (!b || b < 0) return '';
    if (b >= 1048576) return (b / 1048576).toFixed(1) + ' MB';
    return (b / 1024).toFixed(1) + ' KB';
  };

  BlobUtils.prototype.formatFullDate = function(d) {
    if (!d) return '';
    var x = new Date(d);
    if (isNaN(x)) return '';
    return x.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  BlobUtils.prototype.formatToMonthYear = function(d) {
    if (!d) return '';
    var x = new Date(d);
    if (isNaN(x)) return '';
    return ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][x.getMonth()] + ', ' + x.getFullYear();
  };

  BlobUtils.prototype.updateClock = function(day, h, m, ap) {
    var n = new Date();
    day.textContent = n.toLocaleDateString('en-US', { weekday: 'short' }) + ',';
    var hh = n.getHours();
    var mm = String(n.getMinutes()).padStart(2, '0');
    ap.textContent = hh >= 12 ? 'PM' : 'AM';
    hh = hh % 12 || 12;
    h.textContent = String(hh).padStart(2, '0');
    m.textContent = mm;
  };

  BlobUtils.prototype.modal = function(overlay, msgEl, btnEl) {
    function close() {
      overlay.classList.add('hidden', 'opacity-0');
      overlay.classList.remove('flex', 'opacity-100');
      btnEl.innerHTML = '';
      var box = overlay.querySelector('.modal-box');
      if (box) {
        box.classList.remove('scale-100', 'translate-y-0');
        box.classList.add('scale-95', 'translate-y-2');
      }
    }
    function open() {
      overlay.classList.remove('hidden', 'opacity-0');
      overlay.classList.add('flex', 'opacity-100');
      var b = overlay.querySelector('.modal-box');
      if (b) {
        b.classList.remove('scale-95', 'translate-y-2');
        b.classList.add('scale-100', 'translate-y-0');
      }
    }
    function alert(msg, cb) {
      msgEl.textContent = msg;
      overlay.querySelector('.text-4xl i').className = 'fa-solid fa-circle-info';
      btnEl.innerHTML = '<button id="modal-ok-btn" class="bg-[#057c94] hover:bg-[#046a80] text-white px-4 py-1 rounded-full text-[10px] font-semibold min-w-[60px]">OK</button>';
      open();
      document.getElementById('modal-ok-btn').onclick = function() { close(); if (cb) cb(); };
      overlay.onclick = function(e) { if (e.target === overlay) { close(); if (cb) cb(); } };
    }
    function confirm(msg, onOk, onCancel) {
      msgEl.textContent = msg;
      overlay.querySelector('.text-4xl i').className = 'fa-solid fa-triangle-exclamation';
      btnEl.innerHTML =
        '<button id="modal-cancel-btn" class="bg-white/10 hover:bg-white/20 text-gray-300 px-4 py-1 rounded-full text-[10px] border border-white/15 min-w-[60px]">Cancel</button>' +
        '<button id="modal-confirm-btn" class="bg-red-700 hover:bg-red-800 text-white px-4 py-1 rounded-full text-[10px] font-semibold min-w-[60px]">Confirm</button>';
      open();
      document.getElementById('modal-cancel-btn').onclick = function() { close(); if (onCancel) onCancel(); };
      document.getElementById('modal-confirm-btn').onclick = function() { close(); if (onOk) onOk(); };
      overlay.onclick = function(e) { if (e.target === overlay) { close(); if (onCancel) onCancel(); } };
    }
    return { alert: alert, confirm: confirm, close: close };
  };

  /* ================================================================
   * ImageUploadShared — normaliser + KV bridge + API client
   * ================================================================ */
  function ImageUploadShared(options) {
    this.options = Object.assign({
      proxyBase: PROXY_BASE,
      authUrl: AUTH_URL,
      apiBase: API_BASE,
      maxFileSize: MAX_FILE_SIZE
    }, options || {});

    this.localStore = new LocalStore();
    this.pendingSync = new PendingSync();
    this.blobUtils = new BlobUtils();

    /* Instance properties — transports do `shared.API_BASE` etc. */
    this.API_BASE = this.options.apiBase;
    this.MAX_FILE_SIZE = this.options.maxFileSize;
    this.PROXY_BASE = this.options.proxyBase;
    this.AUTH_URL = this.options.authUrl;
  }

  ImageUploadShared.prototype.normaliseItem = function(raw) {
    var r = (raw && raw.data && raw.data.id) ? raw.data : raw;
    return {
      id: r.id,
      title: r.title || (r.image && r.image.filename) || '',
      url: r.url,
      display_url: r.display_url || r.url,
      url_viewer: r.url_viewer || '',
      size: r.size || 0,
      time: r.time || Math.floor(Date.now() / 1000),
      image: r.image || null
    };
  };
  

/* ── Item-shape helpers ─────────────────────────────────────── */
ImageUploadShared.prototype.sameIdentity = function(item) {
  var img = item && item.image;
  if (!img) return false;
  
  var stem = function(s) {
    return String(s || '').replace(/\.[^./\\]+$/, '');
  };
  
  var id = stem(item.id);
  if (!id) return false;
  
  return id === stem(item.title) &&
    id === stem(img.filename) &&
    id === stem(img.name);
};

ImageUploadShared.prototype.countSameIdentity = function(items) {
  var self = this;
  var pass = 0;
  var failures = [];
  
  items.forEach(function(item, i) {
    if (self.sameIdentity(item)) {
      pass++;
    } else {
      failures.push({
        index: i,
        id: item && item.id,
        title: item && item.title,
        filename: item && item.image && item.image.filename,
        name: item && item.image && item.image.name
      });
    }
  });
  
  return {
    total: items.length,
    pass: pass,
    fail: failures.length,
    failures: failures
  };
};


  ImageUploadShared.prototype.kvHeaders = function(apiKey, extra) {
    return Object.assign({ 'Authorization': 'Bearer ' + apiKey }, extra || {});
  };

  ImageUploadShared.prototype.kvList = async function(apiKey) {
    var res = await fetch(this.PROXY_BASE + '/api/kv/list', { headers: this.kvHeaders(apiKey) });
    var json;
    try { json = await res.json(); }
    catch (e) { throw new Error('KV list non-JSON (HTTP ' + res.status + ')'); }
    if (!json.ok) throw new Error(json.error || 'KV list failed');
    return json.items || [];
  };

  ImageUploadShared.prototype.kvAdd = async function(apiKey, item) {
    var res = await fetch(this.PROXY_BASE + '/api/kv/add', {
      method: 'POST',
      headers: this.kvHeaders(apiKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ item: item })
    });
    var json;
    try { json = await res.json(); }
    catch (e) { throw new Error('KV add non-JSON (HTTP ' + res.status + ')'); }
    if (!json.ok) throw new Error(json.error || 'KV add failed');
    return json;
  };

  ImageUploadShared.prototype.kvRemove = async function(apiKey, id) {
    var res = await fetch(this.PROXY_BASE + '/api/kv/remove', {
      method: 'POST',
      headers: this.kvHeaders(apiKey, { 'Content-Type': 'application/json' }),
      body: JSON.stringify({ id: id })
    });
    var json;
    try { json = await res.json(); }
    catch (e) { throw new Error('KV remove non-JSON (HTTP ' + res.status + ')'); }
    if (!json.ok) throw new Error(json.error || 'KV remove failed');
    return json;
  };

  ImageUploadShared.prototype.kvClear = async function(apiKey) {
    var res = await fetch(this.PROXY_BASE + '/api/kv/clear', {
      method: 'POST',
      headers: this.kvHeaders(apiKey)
    });
    var json;
    try { json = await res.json(); }
    catch (e) { throw new Error('KV clear non-JSON (HTTP ' + res.status + ')'); }
    if (!json.ok) throw new Error(json.error || 'KV clear failed');
    return json;
  };

  ImageUploadShared.prototype.screenshot = async function(apiKey, opts) {
    var res = await fetch(this.API_BASE + '/screenshot', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(opts)
    });
    var json;
    try { json = await res.json(); }
    catch (e) { throw new Error('API returned non-JSON (HTTP ' + res.status + ')'); }
    return json;
  };

  ImageUploadShared.prototype.testConnection = async function(apiKey) {
    try {
      var fd = new FormData();
      fd.append('key', apiKey);
      var res = await fetch(this.API_BASE + '/upload', { method: 'POST', body: fd });
      var json;
      try { json = await res.json(); }
      catch (e) { return { connected: false, message: 'Non-JSON (HTTP ' + res.status + ')' }; }
      if (json.success) return { connected: true, message: 'API key valid' };

      var err = json.error || {};
      var code = err.code || err.error_code || json.code;
      var msg = (typeof err === 'string' ? err : err.message) || json.message || '';
      if (code === 140 || /no image/i.test(msg))       return { connected: true,  message: 'API key valid' };
      if (code === 110 || /invalid.*key/i.test(msg))   return { connected: false, message: 'Invalid API key' };
      if (code === 100 || /no api key/i.test(msg))     return { connected: false, message: 'No API key sent' };
      if (code === 120 || /user not found/i.test(msg)) return { connected: false, message: 'User not found' };
      return { connected: false, message: msg || ('HTTP ' + res.status) };
    } catch (e) {
      return { connected: false, message: e.message };
    }
  };

  /* ================================================================
   * AppController — all UI wiring
   * ================================================================ */
  function AppController(shared) {
    this.shared = shared;
    this.client = null;
    this.modal = null;
    this.pendingFiles = [];
    this.slideshow = { items: [], index: 0, open: false };
    this.uploading = false;
    this.currentApiKey = null;
    this.lastCapture = null;
  }

  /* ---- Mode selection ---- */
  AppController.prototype.getActiveMode = function() {
    var qs = new URLSearchParams(location.search).get('mode');
    if (qs === 'sdk' || qs === 'direct') return qs;
    return localStorage.getItem('imageupload_mode') || 'direct';
  };
  AppController.prototype.setActiveMode = function(mode) {
    localStorage.setItem('imageupload_mode', mode);
  };
  AppController.prototype.getActiveTransport = function() {
    var transports = window.ImageUploadTransports || {};
    return transports[this.getActiveMode()] || transports.direct || transports.sdk || null;
  };
  AppController.prototype.updateModeUI = function() {
    var badge = document.getElementById('modeBadge');
    if (!badge) return;

    var transports = window.ImageUploadTransports || {};
    var available = Object.keys(transports);
    var active = transports[this.getActiveMode()];
    var label = active ? active.mode : 'no transport';

    var inner = badge.querySelector('span');
    if (inner) inner.textContent = label;
    else badge.textContent = label;

    var hasChoice = available.length > 1;
    if (badge.tagName === 'BUTTON') {
      badge.disabled = !hasChoice;
      badge.title = hasChoice
        ? 'Click to switch: ' + available.join(' / ')
        : 'Only one transport loaded';
    } else {
      badge.title = hasChoice
        ? 'Both transports loaded — click the badge (button version) to switch, or reload with ?mode=sdk|direct'
        : 'Only one transport loaded';
    }
  };
  AppController.prototype.buildClient = function(apiKey) {
    var TransportClass = this.getActiveTransport();
    if (!TransportClass) throw new Error('No upload transport available on this page.');
    var transport = new TransportClass(apiKey);
    var shared = this.shared;
    return {
      mode: TransportClass.mode,
      uploadOne: function(file, onProgress) { return transport.uploadOne(file, onProgress); },
      screenshot: function(opts) { return shared.screenshot(apiKey, opts); },
      testConnection: function() { return shared.testConnection(apiKey); },
      kvList: function() { return shared.kvList(apiKey); },
      kvAdd: function(item) { return shared.kvAdd(apiKey, item); },
      kvRemove: function(id) { return shared.kvRemove(apiKey, id); },
      kvClear: function() { return shared.kvClear(apiKey); }
    };
  };
  AppController.prototype.toggleMode = function() {
    if (this.uploading) {
      return this.modal.alert('Finish the current upload before switching modes.');
    }
    var transports = window.ImageUploadTransports || {};
    var available = Object.keys(transports);
    if (available.length < 2) return;

    var current = this.getActiveMode();
    var next = available.find(function(k) { return k !== current; }) || available[0];

    this.setActiveMode(next);
    this.updateModeUI();

    if (this.currentApiKey) {
      try {
        this.client = this.buildClient(this.currentApiKey);
        document.getElementById('cfg-mode').textContent = this.client.mode;
      } catch (e) {
        console.warn('Mode swap failed:', e.message);
      }
    }
  };

  /* ---- Object-URL lifecycle ---- */
  AppController.prototype.getFileUrl = function(file) {
    if (!file.__url) {
      try { file.__url = URL.createObjectURL(file); } catch (e) { file.__url = null; }
    }
    return file.__url;
  };
  AppController.prototype.revokeFileUrl = function(file) {
    if (file && file.__url) {
      try { URL.revokeObjectURL(file.__url); } catch (e) {}
      file.__url = null;
    }
  };
  AppController.prototype.revokeAllPendingUrls = function() {
    var self = this;
    this.pendingFiles.forEach(function(f) { self.revokeFileUrl(f); });
  };

  /* ---- init ---- */
  AppController.prototype.init = async function() {
    var self = this;
    this.updateModeUI();

    var badge = document.getElementById('modeBadge');
    if (badge && badge.tagName === 'BUTTON') {
      badge.addEventListener('click', function() { self.toggleMode(); });
    }

    window.addEventListener('imageupload:transport-registered', function() {
      self.updateModeUI();
    });

    if (!this.getActiveTransport()) {
      console.error('No upload transport loaded. Include upload-sdk.js and/or upload-direct.js after shared.js.');
      return;
    }

    this.modal = this.shared.blobUtils.modal(
      document.getElementById('custom-modal-overlay'),
      document.getElementById('modal-message'),
      document.getElementById('modal-buttons')
    );

    var c = {
      day: document.getElementById('clock-day'),
      h:   document.getElementById('clock-hours'),
      m:   document.getElementById('clock-minutes'),
      ap:  document.getElementById('clock-ampm')
    };
    this.shared.blobUtils.updateClock(c.day, c.h, c.m, c.ap);
    setInterval(function() {
      self.shared.blobUtils.updateClock(c.day, c.h, c.m, c.ap);
    }, 1000);

    document.querySelectorAll('#tab-bar .tab-btn').forEach(function(b) {
      b.addEventListener('click', function() { self.setTab(b.id.replace('tab-', '')); });
    });
    document.querySelectorAll('#app-sidebar .nav-btn').forEach(function(b) {
      b.addEventListener('click', function() { self.setTab(b.id.replace('nav-', '')); });
    });

    document.getElementById('refresh-btn').addEventListener('click', function() {
      //self.renderGallery();
      self.syncWithKV();
    });
    document.getElementById('clear-btn').addEventListener('click', function() { self.clearPending(); });
    document.getElementById('upload-btn').addEventListener('click', function() { self.doUpload(); });
    document.getElementById('ss-capture').addEventListener('click', function() { self.doScreenshot(); });
document.getElementById('ss-upload-btn').addEventListener('click', function() { self.handleScreenshotUpload(); });
    
    document.getElementById('test-connection-btn').addEventListener('click', function() { self.doTest(); });
    document.getElementById('change-secret-btn').addEventListener('click', function() { self.changeSecret(); });
    document.getElementById('export-btn').addEventListener('click', function() { self.exportGallery(); });
    document.getElementById('import-input').addEventListener('change', function(e) { self.importGallery(e); });

    document.getElementById('clear-gallery-btn').addEventListener('click', function() {
      self.modal.confirm(
        'Clear the entire gallery (KV + this device)?\nFiles remain on ImageUpload.app but the index will be gone everywhere.',
        async function() {
          try {
            await self.client.kvClear();
          } catch (e) {
            return self.modal.alert('❌ Clear failed: ' + e.message + '\n\nNothing was removed.');
          }
          self.shared.localStore.clear();
          self.shared.pendingSync.clear();
          self.renderGallery();
        }
      );
    });

    var slideshowOv = document.getElementById('slideshow-overlay');
    document.querySelector('#slideshow-overlay .close-btn').addEventListener('click', function() { self.closeSlideshow(); });
    document.getElementById('slideshow-prev').addEventListener('click', function() { self.slide(-1); });
    document.getElementById('slideshow-next').addEventListener('click', function() { self.slide(1); });

    slideshowOv.addEventListener('click', function(e) {
      if (e.target === slideshowOv) self.closeSlideshow();
    });

    var touchStartX = 0;
    slideshowOv.addEventListener('touchstart', function(e) {
      touchStartX = e.changedTouches[0].screenX;
    }, { passive: true });
    slideshowOv.addEventListener('touchend', function(e) {
      var diff = touchStartX - e.changedTouches[0].screenX;
      if (Math.abs(diff) > 50) {
        if (diff > 0) self.slide(1); else self.slide(-1);
      }
    }, { passive: true });

    document.addEventListener('keydown', function(e) {
      if (!self.slideshow.open) return;
      if (e.key === 'Escape') self.closeSlideshow();
      if (e.key === 'ArrowLeft') self.slide(-1);
      if (e.key === 'ArrowRight') self.slide(1);
    });

    var dz = document.getElementById('drop-zone');
    var fi = document.getElementById('file-input');
    dz.addEventListener('click', function() { fi.click(); });
    fi.addEventListener('change', function(e) {
      self.addPending(Array.from(e.target.files));
      e.target.value = '';
    });
    dz.addEventListener('dragover', function(e) {
      e.preventDefault();
      dz.classList.add('border-cyan-400', 'bg-cyan-400/10');
    });
    dz.addEventListener('dragleave', function() {
      dz.classList.remove('border-cyan-400', 'bg-cyan-400/10');
    });
    dz.addEventListener('drop', function(e) {
      e.preventDefault();
      dz.classList.remove('border-cyan-400', 'bg-cyan-400/10');
      self.addPending(Array.from(e.dataTransfer.files));
    });

    var stored = localStorage.getItem('imageupload_secret');
    if (!stored) { this.showUnlock(); return; }
    this.startApp(stored);
  };

  /* ---- Unlock flow ---- */
  AppController.prototype.showUnlock = function() {
    var m = document.getElementById('unlock-modal');
    var icon  = m.querySelector('.text-5xl i');
    var title = m.querySelector('h2');
    var btn   = document.getElementById('unlock-btn');
    var pwd   = document.getElementById('unlock-password');
    var err   = document.getElementById('unlock-error');

    if (icon)  icon.className = 'fa-solid fa-lock';
    if (title) title.textContent = '🔐 Unlock';
    if (btn)   { btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-key mr-1"></i><span>Unlock</span>'; }
    if (pwd)   { pwd.disabled = false; pwd.value = ''; }
    if (err)   err.classList.add('hidden');

    m.classList.remove('hidden'); m.classList.add('flex');
    var self = this;
    btn.onclick = function() { self.doUnlock(); };
    pwd.onkeydown = function(e) {
      if (e.key === 'Enter') { e.preventDefault(); self.doUnlock(); }
    };
    setTimeout(function() { pwd.focus(); }, 100);
  };

  AppController.prototype.doUnlock = async function() {
    var self = this;
    var btn = document.getElementById('unlock-btn');
    if (btn.disabled) return;

    var pw     = document.getElementById('unlock-password').value.trim();
    var err    = document.getElementById('unlock-error');
    var errMsg = document.getElementById('unlock-error-msg');
    err.classList.add('hidden');

    if (!pw) {
      errMsg.textContent = 'Enter a password.';
      err.classList.remove('hidden');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Unlocking…';

    try {
      var res = await fetch(this.shared.AUTH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: pw })
      });
      var json;
      try { json = await res.json(); }
      catch (e) { throw new Error('Proxy returned non-JSON (HTTP ' + res.status + ')'); }

      if (!res.ok || !json.ok || !json.apiKey) {
        errMsg.textContent = (json && json.error) || ('Unlock failed (HTTP ' + res.status + ')');
        err.classList.remove('hidden');
        btn.disabled = false;
        btn.innerHTML = '<i class="fa-solid fa-key mr-1"></i>Unlock';
        return;
      }

      this.showUnlockSuccess();
      setTimeout(function() {
        localStorage.setItem('imageupload_secret', json.apiKey);
        self.startApp(json.apiKey);
      }, 500);
    } catch (e) {
      errMsg.textContent = 'Network error: ' + e.message;
      err.classList.remove('hidden');
      btn.disabled = false;
      btn.innerHTML = '<i class="fa-solid fa-key mr-1"></i>Unlock';
    }
  };

  AppController.prototype.showUnlockSuccess = function() {
    var m = document.getElementById('unlock-modal');
    var icon  = m.querySelector('.text-5xl i');
    var title = m.querySelector('h2');
    var btn   = document.getElementById('unlock-btn');
    var pwd   = document.getElementById('unlock-password');
    if (icon)  icon.className = 'fa-solid fa-circle-check text-emerald-400';
    if (title) title.textContent = '✅ Unlocked';
    if (btn)   btn.innerHTML = '<i class="fa-solid fa-check mr-1"></i><span>Starting…</span>';
    if (pwd)   pwd.disabled = true;
  };

  AppController.prototype.startApp = function(apiKey) {
  this.currentApiKey = apiKey;
  this.client = this.buildClient(apiKey);
  document.getElementById('unlock-modal').classList.add('hidden');
  document.getElementById('unlock-modal').classList.remove('flex');
  document.getElementById('cfg-mode').textContent = this.client.mode;
  document.getElementById('cfg-endpoint').textContent = this.shared.API_BASE;
  document.getElementById('cfg-secret').textContent = '•••• API key (from proxy)';
  document.getElementById('gallery-grid').innerHTML =
    '<div id="spinner" class="col-span-full text-center text-white/50 text-[24px] mt-8 h-full w-full flex items-center justify-center"><i class="fa-solid fa-spinner fa-spin mb-1 text-[32px]"></i><span class="text-[14px]">Loading…</span></div>';
  this.syncWithKV();
};

  AppController.prototype.changeSecret = function() {
    var self = this;
    this.modal.confirm('Forget the stored API key on this device?', function() {
      localStorage.removeItem('imageupload_secret');
      self.currentApiKey = null;
      location.reload();
    });
  };

  /* ---- KV sync ---- */
  AppController.prototype.syncWithKV = async function() {
  if (!this.client) return;
  var self = this;
  var modeLabel = this.client.mode || 'IDLE';
  
  var pending = this.shared.pendingSync.load();
  for (var i = 0; i < pending.length; i++) {
    var p = pending[i];
    try {
      await this.client.kvAdd(p);
      this.shared.pendingSync.remove(p.id);
    } catch (e) {
      console.warn('Pending sync still failing for', p.id, '—', e.message);
    }
  }
  
  var kvItems;
  try {
    kvItems = await this.client.kvList();
    
  } catch (e) {
    console.warn('KV sync skipped:', e.message);
    var b = document.getElementById('modeBadge');
    var inr = b && b.querySelector('span');
    var offlineLabel = modeLabel + ' · offline';
    if (inr) inr.textContent = offlineLabel;
    else if (b) b.textContent = offlineLabel;
    
    this.renderGallery();
    return;
  }
  
  var local = this.shared.localStore.load();
  var kvIds = new Set(kvItems.map(function(x) { return x.id; }));
  var localOnly = local.filter(function(x) { return !kvIds.has(x.id); });
  
  if (localOnly.length) {
    console.log('Backfilling', localOnly.length, 'local-only item(s) to KV…');
    for (var j = 0; j < localOnly.length; j++) {
      var item = localOnly[j];
      try {
        await this.client.kvAdd(item);
      } catch (e) {
        console.warn('Backfill failed for', item.id, '— queued:', e.message);
        this.shared.pendingSync.add(item);
      }
    }
  }
  
  var merged = kvItems.concat(localOnly).sort(function(a, b) {
    return (b.time || 0) - (a.time || 0);
  });
  
  var badge = document.getElementById('modeBadge');
  var inner = badge && badge.querySelector('span');
  if (inner) inner.textContent = modeLabel;
  else if (badge) badge.textContent = modeLabel;
  
  this.shared.localStore.save(merged);
  this.renderGallery();
};

AppController.prototype._setPendingButtonState = function(idx, state) {
  var f = this.pendingFiles[idx];
  if (f) f.__uploadState = state;
  // persist on the file object
  var btn = document.querySelector(
    '#file-preview-grid .remove-pending[data-i="' + idx + '"]'
  );
  if (!btn) return;
  btn.classList.remove('ready', 'success', 'failed');
  btn.classList.add(state);
};

  /* ---- Pending files ---- */
  AppController.prototype.addPending = function(files) {
    var imgs = files.filter(function(f) { return f.type.startsWith('image/'); });
    for (var i = 0; i < imgs.length; i++) {
      var f = imgs[i];
      if (this.pendingFiles.length >= 100) break;
      var dup = this.pendingFiles.some(function(p) { return p.name === f.name && p.size === f.size; });
      if (dup) continue;
      this.pendingFiles.push(f);
    }
    this.renderPending();
  };

  AppController.prototype.renderPending = function() {
    var self = this;
    var grid = document.getElementById('file-preview-grid');
    grid.innerHTML = this.pendingFiles.map(function(f, i) {
      var url = self.getFileUrl(f) || '';
      var tooBig = f.size > self.shared.MAX_FILE_SIZE;
      var badge = tooBig
        ? '<span class="absolute top-1 left-1 bg-red-600/90 text-white text-[7px] px-1 rounded">>32 MB</span>'
        : '';
        var state = f.__uploadState || 'ready';
      return '<div class="relative shrink-0 basis-[calc((100%-1rem)/3)] aspect-square rounded overflow-hidden border border-white/20">' +
        '<img src="' + url + '" class="absolute inset-0 w-full h-full object-contain" />' +
        badge +
        '<button data-i="' + i + '" class="remove-pending absolute top-0 right-0 w-4 h-4 rounded-full ' + state + '"></button>' +
        '<div class="absolute bottom-0 left-0 right-0 bg-black/60 text-[6px] text-white truncate px-1">' + f.name + '</div>' +
        '</div>';
    }).join('');

    grid.querySelectorAll('.remove-pending').forEach(function(b) {
      b.onclick = function() {
        var idx = parseInt(b.dataset.i, 10);
        var removed = self.pendingFiles.splice(idx, 1)[0];
        self.revokeFileUrl(removed);
        self.renderPending();
      };
    });
    document.getElementById('upload-btn').disabled = this.pendingFiles.length === 0;
  };

  AppController.prototype.clearPending = function() {
    this.revokeAllPendingUrls();
    this.pendingFiles = [];
    this.renderPending();
    document.getElementById('upload-progress').classList.add('hidden');
    document.getElementById('progress-bar').style.width = '0%';
    document.getElementById('progress-text').textContent = '0%';
  };

  /* ---- Upload ---- */
  AppController.prototype.doUpload = async function() {
    if (!this.pendingFiles.length || !this.client) return;
    var self = this;

    var oversized = this.pendingFiles.filter(function(f) { return f.size > self.shared.MAX_FILE_SIZE; });
    if (oversized.length) {
      return this.modal.alert(
        oversized.length + " file(s) exceed ImageUpload.app's 32 MB per-file limit:\n\n" +
        oversized.map(function(f) { return '• ' + f.name + '  (' + self.shared.blobUtils.formatFileSize(f.size) + ')'; }).join('\n') +
        '\n\nRemove them from the queue to proceed.'
      );
    }

    var prog = document.getElementById('upload-progress');
    var bar  = document.getElementById('progress-bar');
    var txt  = document.getElementById('progress-text');
    var uploadBtn = document.getElementById('upload-btn');

    prog.classList.remove('hidden');
    bar.style.width = '0%';
    txt.textContent = 'Preparing…';
    uploadBtn.disabled = true;
    this.uploading = true;

    var files   = this.pendingFiles.slice();
    var total   = files.length;
    var results = [];

    try {
      for (var i = 0; i < total; i++) {
        var f = files[i];
        var basePct = (i / total) * 100;
        var spanPct = (1 / total) * 100;

        bar.style.width = Math.round(basePct) + '%';
        txt.textContent = 'Uploading ' + (i + 1) + '/' + total + ' · 0%';

        try {
          /* eslint-disable no-loop-func */
          var item = await this.client.uploadOne(f, (function(idx, bPct, sPct) {
            return function(loaded, reqTotal) {
              var filePct = reqTotal ? loaded / reqTotal : 0;
              var overallPct = Math.min(99, Math.round(bPct + filePct * sPct));
              bar.style.width = overallPct + '%';
              txt.textContent = 'Uploading ' + (idx + 1) + '/' + total + ' · ' + Math.round(bPct + filePct * sPct) + '%';
            };
          })(i, basePct, spanPct));
          /* eslint-enable no-loop-func */
          results.push({ ok: true, file: f, item: item });
          this._setPendingButtonState(i, 'success');
        } catch (e) {
          results.push({ ok: false, file: f, error: e.message });
          this._setPendingButtonState(i, 'failed');
        }
      }

      bar.style.width = '100%';
      txt.textContent = 'Done';

      var successes = results.filter(function(r) { return r.ok; });
      var failures  = results.filter(function(r) { return !r.ok; });

      for (var k = 0; k < successes.length; k++) {
        var r = successes[k];
        if (!r.item || !r.item.id) continue;
        // var itemCopy = Object.assign({}, r.item, {file_modified: (r.file && typeof r.file.lastModified === 'number') ? r.file.lastModified : null});
        
        var itemCopy = Object.assign({}, r.item, {file_modified: (r.file && typeof r.file.lastModified === 'number') ? r.file.lastModified : null, original_name: (r.file && r.file.name) || null});
        this.shared.localStore.add(itemCopy);
        try {
          await this.client.kvAdd(itemCopy);
          this.shared.pendingSync.remove(itemCopy.id);
        } catch (e) {
          console.warn('KV add failed for', itemCopy.id, '— queued:', e.message);
          this.shared.pendingSync.add(itemCopy);
        }
      }

      var failedSet = new Set(failures.map(function(r) { return r.file; }));
      this.pendingFiles.forEach(function(f) {
        if (!failedSet.has(f)) self.revokeFileUrl(f);
      });

      this.pendingFiles = failures.map(function(r) { return r.file; });
      this.renderPending();
      this.renderGallery();

      var self = this; // one capture, used twice
if (failures.length === 0) {
  this.modal.alert(
    '✅ Uploaded ' + successes.length + ' image(s).',
    function() { self.setTab('gallery'); }
  );
} else {
  var lines = failures.slice(0, 20).map(function(f) { return f.file.name + ': ' + f.error; }).join('\n');
  var more = failures.length > 20 ? '\n…and ' + (failures.length - 20) + ' more.' : '';
  this.modal.alert(
    'Uploaded ' + successes.length + ' of ' + total + '.\n\n' +
    'Failed files remain in the queue — retry any time.\n\nErrors:\n' + lines + more,
    function() { self.setTab('gallery'); }
  );
}

    } catch (e) {
      this.modal.alert('❌ Upload failed: ' + e.message);
      bar.style.width = '0%'; txt.textContent = '0%';
    } finally {
      this.uploading = false;
      uploadBtn.disabled = this.pendingFiles.length === 0;
    }
  };

  /* ---- Screenshot ---- */
  AppController.prototype.doScreenshot = async function() {
  if (!this.client) return;
  var url = document.getElementById('ss-url').value.trim();
  if (!url) return this.modal.alert('Please enter a target URL.');
  
  var opts = { url: url };
  var preset = document.getElementById('ss-preset').value;
  if (preset) opts.preset = preset;
  opts.format = document.getElementById('ss-format').value;
  opts.colorScheme = document.getElementById('ss-color').value;
  opts.zoom = parseFloat(document.getElementById('ss-zoom').value);
  if (document.getElementById('ss-full').checked) opts.fullPage = true;
  if (document.getElementById('ss-noads').checked) opts.noAds = true;
  if (document.getElementById('ss-nocookie').checked) opts.noCookie = true;
  opts.share = document.getElementById('ss-share').checked;
  
  var result = document.getElementById('ss-result');
  var preview = document.getElementById('ss-preview');
  result.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Capturing…';
  preview.innerHTML = '<span class="text-white/40 text-[10px]">Working…</span>';
  
  try {
    var r = await this.client.screenshot(opts);
    if (!r || !r.success) throw new Error((r && r.error && r.error.message) || 'Screenshot failed');
    var d = r.data;
    
    /* Store the capture for the Upload button */
    this.lastCapture = { data: d, opts: opts };
    
    var src = d.shared ? (d.display_url || d.url) : d.display_url;
    preview.innerHTML = '<img src="' + src + '" class="max-w-full max-h-full object-contain" />';
    result.innerHTML = '<i class="fa-solid fa-check text-green-400 mr-1"></i>Captured. Click <strong>Upload to Gallery</strong> to save it.';
  } catch (e) {
    this.lastCapture = null;
    result.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-400 mr-1"></i>' + e.message;
    preview.innerHTML = '<span class="text-white/30 text-[10px]">Failed</span>';
  }
};

AppController.prototype.handleScreenshotUpload = async function() {
  if (!this.client) return;
  if (!this.lastCapture) {
    return this.modal.alert('Capture a screenshot first.');
  }
  
  var result = document.getElementById('ss-result');
  var d = this.lastCapture.data;
  var opts = this.lastCapture.opts;
  
  result.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Uploading…';
  
  try {
    var item;
    
    if (d.shared) {
      /* Screenshot is already on ImageUpload.app's CDN — just save its metadata */
      item = {
        id: d.id,
        url: d.url,
        display_url: d.display_url || d.url,
        url_viewer: d.url_viewer || '',
        size: 0,
        time: Math.floor(Date.now() / 1000),
        file_modified: null,
        title: 'screenshot-' + opts.url.replace(/^https?:\/\//, '').replace(/[^\w]/g, '_')
      };
    } else {
      /* Base64 response — upload as a real image via /api/1/upload */
      var blob = await fetch(d.display_url).then(function(r2) { return r2.blob(); });
      var filename = 'screenshot-' + opts.url.replace(/^https?:\/\//, '').replace(/[^\w]/g, '_') + '.png';
      var file = new File([blob], filename, {
        type: blob.type || 'image/png',
        lastModified: Date.now()
      });
      item = await this.client.uploadOne(file);
      item.file_modified = file.lastModified;
    }
    
    this.shared.localStore.add(item);
    try {
      await this.client.kvAdd(item);
      this.shared.pendingSync.remove(item.id);
    } catch (kvErr) {
      console.warn('KV add failed — queued:', kvErr.message);
      this.shared.pendingSync.add(item);
    }
    
    this.renderGallery();
    this.lastCapture = null;
    result.innerHTML = '<i class="fa-solid fa-check text-green-400 mr-1"></i>Saved to gallery.';
  } catch (e) {
    result.innerHTML = '<i class="fa-solid fa-circle-xmark text-red-400 mr-1"></i>Upload failed: ' + e.message;
  }
};

/* ── Canonical accessors — read these, never the raw fields ─── */
ImageUploadShared.prototype.imageUrl = function(it) {
  if (!it) return '';
  return it.display_url || it.url || (it.image && it.image.url) || '';
};

ImageUploadShared.prototype.viewerUrl = function(it) {
  return (it && it.url_viewer) || '';
};

ImageUploadShared.prototype.extension = function(it) {
  if (it && it.image && it.image.extension) return it.image.extension;
  var m = /\.([^./\\]+)$/.exec(it && (it.url || it.title) || '');
  return m ? m[1] : '';
};

ImageUploadShared.prototype.displayTitle = function(it) {
  if (!it) return '';
  return it.original_name                     // client — most human
      || (it.image && it.image.filename)      // API canonical
      || it.title                             // API default
      || this.imageUrl(it).replace(/^.*\//, '') // last resort
      || '';
};

ImageUploadShared.prototype.identity = function(it) {
  return (it && (it.id || (it.image && it.image.name))) || '';
};

  /* ---- Gallery ---- */
  AppController.prototype.renderGallery = function() {
    var self = this;
    var grid = document.getElementById('gallery-grid');
    var items = this.shared.localStore.load();
    var blob = this.shared.blobUtils;
    
    const jsonEl = document.getElementById('json');
    jsonEl.textContent = JSON.stringify(items, null, 2);
    hljs.highlightElement(jsonEl);

    
    document.getElementById('summary-total-count').textContent = items.length;
    if (items.length) {
      var last = items.reduce(function(a, b) { return a.time > b.time ? a : b; });
      document.getElementById('summary-last-upload').textContent = blob.formatFullDate(last.time * 1000);
    } else {
      document.getElementById('summary-last-upload').textContent = '—';
    }

    if (!items.length) {
      grid.innerHTML = '<div class="col-span-full text-center text-white/40 text-[10px] mt-8"><span>No images yet. Upload or capture a screenshot.</span></div>';
      return;
    }

    grid.innerHTML = items.map(function(it, idx) {
      var displayMs = (typeof it.file_modified === 'number') ? it.file_modified : it.time * 1000;
      return '<div class="image-card relative bg-white/10 border border-white/10 rounded-lg overflow-hidden cursor-pointer" style="height:0;padding-bottom:133.33%;" data-index="' + idx + '">' +
        '<img src="' + self.shared.imageUrl(it) + '" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover" />' +
        '<button data-id="' + it.id + '" class="delete-btn absolute top-1 right-1 bg-black/50 hover:bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-[8px] z-10" title="Remove from gallery"><i class="fa-solid fa-trash-can"></i></button>' +
        '<div class="absolute bottom-0 left-0 right-0 p-[2px] flex justify-between bg-gradient-to-t from-black/70 to-transparent z-10">' +
        '<div class="flex-1 truncate text-[7px] text-white/80">' + self.shared.displayTitle(it) + '</div>' +
        '<div class="text-[7px] text-cyan-300">' + blob.formatFileSize(it.size) + '</div>' +
        '</div>' +
        '<span class="absolute top-0 left-0 p-[2px] text-[7px] text-white bg-gradient-to-t from-black/70 to-transparent z-10">' + blob.formatToMonthYear(displayMs) + '</span>' +
        '</div>';
    }).join('');

    grid.querySelectorAll('.image-card').forEach(function(card) {
      card.addEventListener('click', function(e) {
        if (e.target.closest('.delete-btn')) return;
        self.openSlideshow(parseInt(card.dataset.index, 10));
      });
    });

    grid.querySelectorAll('.delete-btn').forEach(function(b) {
      b.addEventListener('click', function(e) {
        e.stopPropagation();
        self.modal.confirm(
          'Remove this image from the gallery? (The file stays on ImageUpload.app.)',
          async function() {
            var id = b.dataset.id;
            try {
              await self.client.kvRemove(id);
            } catch (e2) {
              return self.modal.alert('❌ Delete failed: ' + e2.message + '\n\nNothing was removed.');
            }
            self.shared.localStore.remove(id);
            self.shared.pendingSync.remove(id);
            self.renderGallery();
          }
        );
      });
    });
  };

  /* ---- Slideshow ---- */
  AppController.prototype.openSlideshow = function(i) {
    var items = this.shared.localStore.load();
    if (!items.length) return;
    this.slideshow = { items: items, index: Math.min(i, items.length - 1), open: true };
    var ov = document.getElementById('slideshow-overlay');
    ov.classList.remove('hidden', 'opacity-0');
    ov.classList.add('flex', 'opacity-100');
    this.loadSlide();
  };
  AppController.prototype.closeSlideshow = function() {
    this.slideshow.open = false;
    var ov = document.getElementById('slideshow-overlay');
    ov.classList.add('hidden', 'opacity-0');
    ov.classList.remove('flex', 'opacity-100');
  };
  AppController.prototype.slide = function(d) {
    if (!this.slideshow.open) return;
    this.slideshow.index = (this.slideshow.index + d + this.slideshow.items.length) % this.slideshow.items.length;
    this.loadSlide();
  };
  AppController.prototype.loadSlide = function() {
    var it = this.slideshow.items[this.slideshow.index];
    var img = document.getElementById('slideshow-image');
    var loader = document.querySelector('#slideshow-overlay .slideshow-loader');
    document.getElementById('slideshow-counter').textContent = (this.slideshow.index + 1) + ' / ' + this.slideshow.items.length;
    loader.style.display = 'block';
    img.style.opacity = '0';
    var real = new Image();
    real.onload = function() { img.src = it.url; loader.style.display = 'none'; img.style.opacity = '1'; };
    real.onerror = function() { loader.style.display = 'none'; img.style.opacity = '1'; img.alt = 'Failed'; };
    real.src = it.url;
  };

  /* ---- Test / Export / Import / Tabs ---- */
  AppController.prototype.doTest = async function() {
    var el = document.getElementById('test-result');
    el.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1"></i>Testing…';
    var r = await this.client.testConnection();
    el.innerHTML = r.connected
      ? '<i class="fa-solid fa-check-circle text-green-400 mr-1"></i>' + r.message
      : '<i class="fa-solid fa-circle-xmark text-red-400 mr-1"></i>' + r.message;
  };

  AppController.prototype.exportGallery = function() {
    var blob = new Blob([JSON.stringify(this.shared.localStore.load(), null, 2)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'imageupload-gallery-' + Date.now() + '.json';
    a.click();
    setTimeout(function() { URL.revokeObjectURL(a.href); }, 1000);
  };

  AppController.prototype.importGallery = function(e) {
    var self = this;
    var file = e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = async function() {
      try {
        var data = JSON.parse(reader.result);
        if (!Array.isArray(data)) throw new Error('Expected array');
        var existing = self.shared.localStore.load();
        var ids = new Set(existing.map(function(x) { return x.id; }));
        var incoming = data.filter(function(x) { return x && x.id && !ids.has(x.id); });

        var merged = existing.concat(incoming);
        self.shared.localStore.save(merged);
        self.renderGallery();

        var pushed = 0, queued = 0;
        for (var i = 0; i < incoming.length; i++) {
          var item = incoming[i];
          try {
            await self.client.kvAdd(item);
            self.shared.pendingSync.remove(item.id);
            pushed++;
          } catch (err) {
            self.shared.pendingSync.add(item);
            queued++;
          }
        }

        var msg = 'Imported ' + incoming.length + ' new item(s).';
        if (queued > 0) msg += '\n' + pushed + ' pushed to KV, ' + queued + ' queued for retry.';
        self.modal.alert(msg);
      } catch (err) {
        self.modal.alert('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  AppController.prototype.setTab = function(name) {
    document.querySelectorAll('#tab-container > div > [id^="tab-pane-"]').forEach(function(p) {
      p.classList.add('hidden');
    });
    var pane = document.getElementById('tab-pane-' + name);
    if (pane) pane.classList.remove('hidden');
    document.querySelectorAll('#tab-bar .tab-btn').forEach(function(b) {
      var active = b.id === 'tab-' + name;
      b.className = active
        ? 'tab-btn flex-1 text-center py-0.5 text-white border-b-[1.5px] border-cyan-400 font-medium text-[10px]'
        : 'tab-btn flex-1 text-center py-0.5 text-white/60 border-b-[1.5px] border-transparent hover:text-white hover:border-cyan-400/50 text-[10px]';
    });
    document.querySelectorAll('#app-sidebar .nav-btn').forEach(function(b) {
      b.classList.toggle('active', b.id === 'nav-' + name);
    });
  };

  /* ================================================================
   * Boot — create singletons, export, wire DOMContentLoaded
   * ================================================================ */
  var sharedInstance = new ImageUploadShared();
  var appInstance = new AppController(sharedInstance);

  global.ImageUploadShared = sharedInstance;
  global.ImageUploadSharedClass = ImageUploadShared;
  global.LocalStore = LocalStore;
  global.PendingSync = PendingSync;
  global.BlobUtils = BlobUtils;
  global.ImageUploadAppController = appInstance;

  /* UMD export — matches imageupload-sdk.js pattern */
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ImageUploadShared;
  } else if (typeof define === 'function' && define.amd) {
    define(function() { return ImageUploadShared; });
  }

  document.addEventListener('DOMContentLoaded', function() {
    appInstance.init();
  });

})(typeof window !== 'undefined' ? window : this);