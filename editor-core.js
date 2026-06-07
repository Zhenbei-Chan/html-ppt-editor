(function () {
  const UI = "data-hpe-ui";
  const ID = "data-hpe-id";
  const FREE = "data-hpe-free-position";
  const POSITION_ORIGIN = "data-hpe-position-origin";
  const EDITABLE = "data-hpe-contenteditable";
  const FLOATING = "data-hpe-floating-adapted";
  const DRAFT_DB = "html-ppt-editor-drafts";
  const DRAFT_STORE = "drafts";
  const DRAFT_DB_VERSION = 1;

  const SYSTEM_FONTS = [
    ['HarmonyOS Sans', '鸿蒙黑体 / HarmonyOS Sans'],
    ['Microsoft YaHei', '微软雅黑 / Microsoft YaHei'],
    ['SimSun', '宋体 / SimSun'],
    ['PingFang SC', 'PingFang SC'],
    ['Noto Sans CJK', 'Noto Sans CJK'],
    ['Source Han Sans', '思源黑体 / Source Han Sans'],
    ['Arial', 'Arial'],
    ['Helvetica', 'Helvetica'],
    ['Times New Roman', 'Times New Roman'],
    ['Georgia', 'Georgia'],
    ['Verdana', 'Verdana']
  ];

  function openDraftDb(targetWindow = window) {
    return new Promise((resolve, reject) => {
      const indexedDb = targetWindow.indexedDB || window.indexedDB;
      if (!indexedDb) {
        reject(new Error("IndexedDB is not available."));
        return;
      }
      let settled = false;
      const timeout = targetWindow.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("IndexedDB open timed out."));
      }, 1000);
      const finish = (callback) => {
        if (settled) return;
        settled = true;
        targetWindow.clearTimeout(timeout);
        callback();
      };
      const request = indexedDb.open(DRAFT_DB, DRAFT_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(DRAFT_STORE)) {
          db.createObjectStore(DRAFT_STORE, { keyPath: "key" });
        }
      };
      request.onsuccess = () => finish(() => resolve(request.result));
      request.onerror = () => finish(() => reject(request.error || new Error("Failed to open IndexedDB.")));
      request.onblocked = () => finish(() => reject(new Error("IndexedDB open was blocked.")));
    });
  }

  function withDraftStore(targetWindow, mode, callback) {
    return openDraftDb(targetWindow).then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(DRAFT_STORE, mode);
      const store = tx.objectStore(DRAFT_STORE);
      let request;
      try {
        request = callback(store);
      } catch (error) {
        db.close();
        reject(error);
        return;
      }
      tx.oncomplete = () => {
        db.close();
        resolve(request?.result);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error || new Error("Draft transaction failed."));
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error || new Error("Draft transaction aborted."));
      };
    }));
  }

  function saveDraftToIndexedDb(targetWindow, key, payload) {
    return withDraftStore(targetWindow, "readwrite", (store) => store.put({
      key,
      ...payload
    }));
  }

  function getDraftFromIndexedDb(targetWindow, key) {
    return withDraftStore(targetWindow, "readonly", (store) => store.get(key)).then((record) => {
      if (!record) return null;
      const { key: _key, ...payload } = record;
      return payload;
    });
  }

  function removeDraftFromIndexedDb(targetWindow, key) {
    return withDraftStore(targetWindow, "readwrite", (store) => store.delete(key));
  }

  function saveDraftWithFallback(targetWindow, key, payload) {
    return saveDraftToIndexedDb(targetWindow, key, payload).catch((error) => {
      targetWindow.localStorage.setItem(key, JSON.stringify(payload));
      return { fallback: "localStorage", message: error.message };
    });
  }

  function getDraftWithFallback(targetWindow, key) {
    return getDraftFromIndexedDb(targetWindow, key).then((payload) => {
      if (payload) return payload;
      const raw = targetWindow.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    }).catch(() => {
      const raw = targetWindow.localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    });
  }

  function removeDraftWithFallback(targetWindow, key) {
    return removeDraftFromIndexedDb(targetWindow, key).catch(() => null).then(() => {
      targetWindow.localStorage.removeItem(key);
    });
  }

  function createHtmlPptEditor(targetWindow, options = {}) {
    const win = targetWindow || window;
    const doc = win.document;
    const state = {
      selected: null,
      beforeEdit: "",
      history: [],
      redo: [],
      mode: "edit",
      drag: null,
      resize: null,
      panelDrag: null,
      savedRange: null,
      placingText: false,
      placementX: 0,
      placementY: 0,
      slides: [],
      activeSlideIndex: 0,
      logs: [],
      saveTimer: null,
      floatingTimer: null,
      minimapTimer: null,
      minimapSignature: "",
      minimapDrag: null,
      thumbDragIndex: null,
      thumbCollapsed: false,
      thumbSelectionActive: false,
      thumbMenuIndex: null,
      slideScrollLockUntil: 0,
      slideScrollTarget: 0,
      minimapHover: false,
      floatingRecords: [],
      hiddenPointerNodes: [],
      sourceName: options.sourceName || doc.title || "html-ppt.html",
      exportName: options.exportName || "html-ppt-edited.html",
      logoUrl: options.logoUrl || "",
      draftKey: options.draftKey || `hpe:draft:${win.location.href}`,
      reserveWorkspace: Boolean(options.reserveWorkspace),
      showWelcome: Boolean(options.showWelcome),
      onWelcomeDismissed: options.onWelcomeDismissed || null,
      zoom: 100,
      fullscreen: false,
      feedbackTimer: null,
      pdfProgressTimer: null
    };

    injectStyle();
    ensureBody();
    assignStableIds();
    const ui = buildUi();
    if (state.reserveWorkspace) ui.root.classList.add("hpe-shell-root");
    ui.root.classList.add("panel-collapsed");
    doc.documentElement.classList.add("hpe-editing-active");
    if (state.reserveWorkspace) doc.documentElement.classList.add("hpe-shell-layout", "hpe-panel-collapsed");
    detectSlides();
    bindEvents();
    updateSlideUi();
    updatePanel();
    hidePointerDecorations();
    adaptFloatingElements();
    log("editor_started", { mode: getPageMode() });

    if (state.showWelcome) showWelcome();

    return {
      destroy,
      exportHtml,
      setPreviewMode,
      setEditMode,
      getDiagnostics
    };

    function ensureBody() {
      if (!doc.body) {
        const body = doc.createElement("body");
        doc.documentElement.appendChild(body);
      }
    }

    function injectStyle() {
      if (doc.getElementById("hpe-editor-style")) return;
      const style = doc.createElement("style");
      style.id = "hpe-editor-style";
      style.setAttribute(UI, "true");
      style.textContent = `
        html.hpe-editing-active, html.hpe-editing-active * { cursor: auto !important; }
        html.hpe-shell-layout { --hpe-side-width: 352px; --hpe-rail-width: 64px; --hpe-thumb-width: 0px; --hpe-top-height: 56px; --hpe-status-height: 32px; }
        html.hpe-shell-layout.hpe-has-slide-thumbs { --hpe-thumb-width: 136px; }
        html.hpe-shell-layout.hpe-has-slide-thumbs.hpe-thumbs-collapsed { --hpe-thumb-width: 38px; }
        html.hpe-shell-layout.hpe-panel-collapsed { --hpe-side-width: var(--hpe-rail-width); }
        html.hpe-shell-layout.hpe-editing-active { overflow: hidden !important; }
        html.hpe-shell-layout.hpe-editing-active body { height: calc(100vh - var(--hpe-top-height) - var(--hpe-status-height)) !important; margin-top: var(--hpe-top-height) !important; margin-left: var(--hpe-thumb-width) !important; margin-right: 0 !important; overflow: auto !important; width: calc(100vw - var(--hpe-side-width) - var(--hpe-thumb-width)) !important; max-width: calc(100vw - var(--hpe-side-width) - var(--hpe-thumb-width)) !important; }
        html.hpe-shell-layout.hpe-editing-active body > :not([data-hpe-ui]) { zoom: var(--hpe-canvas-zoom, 100%); }
        html.hpe-shell-layout.hpe-editing-active [${FLOATING}="true"] { box-sizing: border-box !important; }
        .hpe-root, .hpe-root * { box-sizing: border-box; font-family: "HarmonyOS Sans", "Microsoft YaHei", "PingFang SC", Arial, sans-serif; letter-spacing: 0; }
        .hpe-root { --hpe-side-width: 352px; --hpe-rail-width: 64px; --hpe-panel-width: 288px; --hpe-top-height: 56px; --hpe-status-height: 32px; --hpe-primary: #1677ff; --hpe-primary-hover: #0f63d9; --hpe-danger: #e5484d; --hpe-text: #0a1a33; --hpe-muted: #5f6b7a; --hpe-border: #e5eaf0; position: fixed; inset: 0; z-index: 2147483646; pointer-events: none; color: var(--hpe-text); }
        .hpe-appbar { align-items: center; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--hpe-border); display: flex; height: var(--hpe-top-height); justify-content: space-between; left: 0; padding: 0 16px; pointer-events: auto; position: fixed; right: 0; top: 0; }
        .hpe-brand { align-items: center; display: flex; gap: 10px; min-width: 0; }
        .hpe-logo { align-items: center; background: #eef5ff; border: 1px solid #cfe1ff; border-radius: 7px; display: inline-flex; height: 28px; justify-content: center; overflow: hidden; width: 28px; }
        .hpe-logo img { display: block; height: 22px; width: 22px; }
        .hpe-logo-fallback { color: var(--hpe-primary); font-size: 14px; font-weight: 700; }
        .hpe-title { font-size: 15px; font-weight: 650; }
        .hpe-file { color: var(--hpe-muted); font-size: 12px; max-width: 360px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hpe-appbar-center { color: var(--hpe-muted); font-size: 13px; }
        .hpe-appbar-actions { align-items: center; display: flex; gap: 6px; }
        .hpe-appbar button, .hpe-previewbar button, .hpe-export-modal button { align-items: center; border: 1px solid #d0d7e2; border-radius: 6px; background: #fff; color: var(--hpe-text); cursor: pointer; display: inline-flex; font: inherit; font-size: 13px; gap: 6px; min-height: 32px; padding: 0 12px; }
        .hpe-appbar button:hover, .hpe-previewbar button:hover, .hpe-export-modal button:hover { background: #f6f8fb; }
        .hpe-appbar .primary, .hpe-previewbar .primary, .hpe-export-modal .primary { background: var(--hpe-primary); border-color: var(--hpe-primary); color: #fff; }
        .hpe-appbar .primary:hover, .hpe-previewbar .primary:hover, .hpe-export-modal .primary:hover { background: var(--hpe-primary-hover); }
        .hpe-save-feedback { color: #11845b; font-size: 12px; font-weight: 600; min-width: 52px; opacity: 0; transition: opacity .16s ease; }
        .hpe-save-feedback.visible { opacity: 1; }
        .hpe-save-feedback.error { color: var(--hpe-danger); }
        .hpe-icon-button { align-items: center; display: inline-flex; gap: 5px; }
        .hpe-icon-only { gap: 0; justify-content: center; padding-left: 0 !important; padding-right: 0 !important; width: 28px; }
        .hpe-icon-only .hpe-button-label, .hpe-visually-hidden { clip: rect(0 0 0 0); height: 1px; margin: -1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
        .hpe-topbar { position: fixed; right: var(--hpe-panel-width); top: var(--hpe-top-height); bottom: var(--hpe-status-height); width: var(--hpe-rail-width); display: flex; flex-direction: column; gap: 3px; align-items: center; background: #fff; border-left: 1px solid var(--hpe-border); border-right: 1px solid var(--hpe-border); padding: 6px 5px; pointer-events: auto; overflow: hidden; }
        .hpe-thumb-rail { background: rgba(248,250,252,.98); border-right: 1px solid var(--hpe-border); bottom: var(--hpe-status-height); display: none; left: 0; overflow: auto; padding: 8px; pointer-events: auto; position: fixed; top: var(--hpe-top-height); width: var(--hpe-thumb-width); }
        .hpe-root.has-slides .hpe-thumb-rail { display: block; }
        .hpe-thumb-toggle { align-items: center; background: #fff; border: 1px solid #d0d7e2; border-radius: 8px; color: var(--hpe-text); cursor: pointer; display: inline-flex; height: 28px; justify-content: center; margin-bottom: 8px; padding: 0; position: sticky; top: 0; width: 28px; z-index: 1; }
        .hpe-thumb-toggle::before { background: currentColor; content: ""; display: block; height: 16px; -webkit-mask: var(--hpe-icon) center / contain no-repeat; mask: var(--hpe-icon) center / contain no-repeat; width: 16px; }
        .hpe-thumb-list { display: flex; flex-direction: column; gap: 8px; }
        .hpe-thumb-item { align-items: stretch; background: transparent; border: 0; color: var(--hpe-text); cursor: grab; display: block; padding: 0; text-align: left; }
        .hpe-thumb-item:active { cursor: grabbing; }
        .hpe-thumb-card { background: #fff; border: 2px solid #d8e0ec; border-radius: 8px; min-height: 66px; overflow: hidden; padding: 6px; }
        .hpe-thumb-item.active .hpe-thumb-card { border-color: var(--hpe-primary); box-shadow: 0 0 0 2px rgba(22,119,255,.12); }
        .hpe-thumb-index { color: var(--hpe-muted); font-size: 11px; font-weight: 700; margin-bottom: 4px; }
        .hpe-thumb-title { color: var(--hpe-text); font-size: 11px; font-weight: 650; line-height: 1.25; max-height: 28px; overflow: hidden; }
        .hpe-thumb-lines { display: grid; gap: 3px; margin-top: 6px; }
        .hpe-thumb-lines span { background: #e8eef8; border-radius: 999px; display: block; height: 4px; }
        .hpe-root.thumbs-collapsed .hpe-thumb-rail { overflow: hidden; padding: 8px 5px; }
        .hpe-root.thumbs-collapsed .hpe-thumb-list { display: none; }
        .hpe-root.thumbs-collapsed .hpe-thumb-toggle { margin-left: 0; width: 28px; }
        .hpe-thumb-menu { background: #fff; border: 1px solid #d0d7e2; border-radius: 8px; box-shadow: 0 12px 30px rgba(16,24,40,.18); display: none; min-width: 112px; padding: 4px; pointer-events: auto; position: fixed; z-index: 2147483647; }
        .hpe-thumb-menu.open { display: block; }
        .hpe-thumb-menu button { align-items: center; background: transparent; border: 0; border-radius: 6px; color: var(--hpe-danger); cursor: pointer; display: flex; font-size: 13px; gap: 8px; padding: 8px 10px; width: 100%; }
        .hpe-thumb-menu button:hover { background: #fff1f1; }
        .hpe-minimap { background: rgba(255,255,255,.96); border: 1px solid #d0d7e2; border-radius: 10px; box-shadow: 0 12px 36px rgba(16,24,40,.18); display: none; left: 14px; overflow: hidden; padding: 8px; pointer-events: auto; position: fixed; top: calc(var(--hpe-top-height) + 12px); width: 132px; z-index: 2147483647; }
        .hpe-minimap.open { display: block; }
        .hpe-minimap-track { background: linear-gradient(#f5f8ff, #fff); border: 1px solid #d8e0ec; border-radius: 7px; cursor: pointer; height: 190px; overflow: hidden; position: relative; }
        .hpe-minimap-content { inset: 0; position: absolute; }
        .hpe-minimap-node { background: #e8eef8; border-radius: 3px; opacity: .95; position: absolute; }
        .hpe-minimap-node.title { background: #13233f; min-height: 5px; }
        .hpe-minimap-node.text { background: #b9c6da; }
        .hpe-minimap-node.card { background: #fff; border: 1px solid #d5dfef; box-shadow: 0 1px 2px rgba(16,24,40,.08); }
        .hpe-minimap-node.image { background: linear-gradient(135deg, #dbeafe, #edf2ff); border: 1px solid #bfdbfe; }
        .hpe-minimap-window { background: rgba(22,119,255,.14); border: 2px solid var(--hpe-primary); border-radius: 6px; cursor: grab; left: 5px; position: absolute; right: 5px; top: 0; }
        .hpe-minimap-window:active { cursor: grabbing; }
        .hpe-minimap-window::after { background: var(--hpe-primary); border-radius: 999px; content: ""; height: 16px; left: 50%; margin-left: -13px; position: absolute; top: 50%; transform: translateY(-50%); width: 26px; }
        .hpe-tool-group { display: flex; flex-direction: column; gap: 1px; align-items: center; border-bottom: 1px solid var(--hpe-border); padding-bottom: 4px; width: 100%; }
        .hpe-tool-group:last-child { border-bottom: 0; padding-bottom: 0; }
        .hpe-topbar button, .hpe-panel button, .hpe-welcome button { border: 1px solid #d0d7e6; border-radius: 8px; background: #fff; color: #111827; cursor: pointer; font-size: 12px; line-height: 1; min-height: 34px; padding: 7px 10px; white-space: nowrap; }
        .hpe-topbar button { align-items: center; background: transparent; border-color: transparent; color: var(--hpe-text); display: inline-flex; flex-direction: column; font-size: 10px; gap: 2px; height: 32px; justify-content: center; padding: 0; width: 52px; }
        .hpe-topbar button::before, .hpe-icon-button::before { background: currentColor; content: ""; display: block; flex: 0 0 auto; height: 15px; -webkit-mask: var(--hpe-icon) center / contain no-repeat; mask: var(--hpe-icon) center / contain no-repeat; width: 15px; }
        .hpe-topbar button:hover, .hpe-panel button:hover, .hpe-welcome button:hover { background: #f6f8fb; border-color: #b8c4d8; }
        .hpe-topbar button:hover { background: #eef5ff; border-color: #cfe1ff; color: var(--hpe-primary); }
        .hpe-topbar .primary { background: var(--hpe-primary); border-color: var(--hpe-primary); color: #fff; }
        .hpe-topbar .danger { color: var(--hpe-danger); }
        .hpe-topbar .hpe-preview-visible { display: none; }
        .hpe-topbar button[data-action="edit"], .hpe-icon-button[data-action="edit"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 3l15 8-6 2-2 6L4 3Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="preview"], .hpe-icon-button[data-action="preview"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 4v16l13-8L7 4Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="togglePanel"], .hpe-icon-button[data-action="togglePanel"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v3H4V5Zm0 5h7v9H4v-9Zm9 0h7v9h-7v-9Z'/%3E%3C/svg%3E"); }
        .hpe-thumb-toggle[data-action="toggleThumbnails"], .hpe-icon-button[data-action="toggleThumbnails"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 4h12l4 8-4 8H5V4Zm3 3v4h6V7H8Zm0 6v4h6v-4H8Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="prevSlide"], .hpe-icon-button[data-action="prevSlide"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M14 6 8 12l6 6V6Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="nextSlide"], .hpe-icon-button[data-action="nextSlide"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='m10 6 6 6-6 6V6Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="undo"], .hpe-icon-button[data-action="undo"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 7V3L2 9l6 6v-4h6c3 0 5 2 5 5 0 .8-.2 1.6-.5 2.3 1.5-1.2 2.5-3 2.5-5.3 0-3.7-3-6-7-6H8Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="redo"], .hpe-icon-button[data-action="redo"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M16 7V3l6 6-6 6v-4h-6c-3 0-5 2-5 5 0 .8.2 1.6.5 2.3C4 17.1 3 15.3 3 13c0-3.7 3-6 7-6h6Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="addText"], .hpe-icon-button[data-action="addText"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v3h-6v12h-4V8H4V5Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="left"], .hpe-icon-button[data-action="left"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v2H4V5Zm0 4h11v2H4V9Zm0 4h16v2H4v-2Zm0 4h11v2H4v-2Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="centerText"], .hpe-icon-button[data-action="centerText"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v2H4V5Zm3 4h10v2H7V9Zm-3 4h16v2H4v-2Zm3 4h10v2H7v-2Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="right"], .hpe-icon-button[data-action="right"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v2H4V5Zm5 4h11v2H9V9Zm-5 4h16v2H4v-2Zm5 4h11v2H9v-2Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="copy"], .hpe-icon-button[data-action="copy"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 8h11v11H8V8Zm-3 8V5h11v2H7v9H5Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="delete"], .hpe-icon-button[data-action="delete"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 7h10l-1 14H8L7 7Zm2-4h6l1 2h4v2H4V5h4l1-2Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="exportPreview"], .hpe-icon-button[data-action="exportPreview"], .hpe-icon-button[data-action="downloadExport"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 4h2v9l3-3 1.5 1.5L12 17l-5.5-5.5L8 10l3 3V4ZM5 19h14v2H5v-2Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="exportPdf"], .hpe-icon-button[data-action="exportPdf"], .hpe-icon-button[data-action="exportPdfAll"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M6 2h9l5 5v15H6V2Zm8 1.8V8h4.2L14 3.8ZM8 13h8v2H8v-2Zm0 4h8v2H8v-2Zm0-8h4v2H8V9Z'/%3E%3C/svg%3E"); }
        .hpe-topbar button[data-action="confirmExport"], .hpe-icon-button[data-action="confirmExport"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2Z'/%3E%3C/svg%3E"); }
        .hpe-icon-button[data-action="saveDraft"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 3h12l2 2v16H5V3Zm3 2v5h8V5H8Zm0 10v4h8v-4H8Z'/%3E%3C/svg%3E"); }
        .hpe-icon-button[data-action="zoomOut"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M5 11h14v2H5v-2Z'/%3E%3C/svg%3E"); }
        .hpe-icon-button[data-action="zoomIn"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z'/%3E%3C/svg%3E"); }
        .hpe-icon-button[data-action="fullscreen"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 4h7v2H7.4l4.1 4.1-1.4 1.4L6 7.4V11H4V4Zm9 0h7v7h-2V7.4l-4.1 4.1-1.4-1.4L16.6 6H13V4ZM4 13h2v3.6l4.1-4.1 1.4 1.4L7.4 18H11v2H4v-7Zm14 0h2v7h-7v-2h3.6l-4.1-4.1 1.4-1.4 4.1 4.1V13Z'/%3E%3C/svg%3E"); }
        .hpe-icon-button[data-action="closeExportModal"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M8 7V3L2 9l6 6v-4h12V7H8Z'/%3E%3C/svg%3E"); }
        .hpe-panel { position: fixed; right: 0; top: var(--hpe-top-height); bottom: var(--hpe-status-height); width: var(--hpe-panel-width); overflow: auto; background: rgba(255,255,255,.98); border-left: 1px solid #d7deea; box-shadow: -8px 0 24px rgba(16,24,40,.08); padding: 0 14px 16px; pointer-events: auto; }
        .hpe-panel-tabs { align-items: center; border-bottom: 1px solid var(--hpe-border); display: grid; grid-template-columns: repeat(3, 1fr); gap: 0; margin: 0 -14px 12px; position: sticky; top: 0; background: rgba(255,255,255,.98); z-index: 1; }
        .hpe-panel-tabs span { color: var(--hpe-muted); font-size: 13px; font-weight: 600; padding: 13px 8px 10px; text-align: center; }
        .hpe-panel-tabs .active { color: var(--hpe-primary); box-shadow: inset 0 -2px 0 var(--hpe-primary); }
        .hpe-panel-header { align-items: center; cursor: grab !important; display: flex; gap: 8px; justify-content: space-between; margin: -4px -2px 12px; padding: 4px 2px 8px; user-select: none; }
        .hpe-panel-header:active { cursor: grabbing !important; }
        .hpe-shell-root .hpe-panel-header, .hpe-shell-root .hpe-panel-header:active { cursor: default !important; }
        .hpe-shell-root [data-action="resetPanel"] { display: none; }
        .hpe-panel-actions { display: flex; gap: 6px; }
        .hpe-panel-actions button { min-height: 28px; padding: 5px 8px; }
        .hpe-root.panel-collapsed { --hpe-side-width: var(--hpe-rail-width); }
        .hpe-root.panel-collapsed .hpe-panel { display: none; }
        .hpe-root.panel-collapsed .hpe-topbar { right: 0; }
        .hpe-panel-tab { display: none; }
        .hpe-panel h2 { font-size: 15px; margin: 0 0 10px; }
        .hpe-panel h3 { border-top: 1px solid #eaecf0; color: #344054; font-size: 12px; margin: 12px 0 8px; padding-top: 12px; }
        .hpe-field { display: grid; grid-template-columns: 34px 1fr; align-items: center; gap: 6px; margin: 6px 0; }
        .hpe-field label { color: #667085; font-size: 12px; }
        .hpe-field input, .hpe-field select { border: 1px solid #cfd6e4; border-radius: 7px; font-size: 12px; min-width: 0; padding: 6px; width: 100%; }
        .hpe-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 5px; }
        .hpe-grid-3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
        .hpe-panel .hpe-grid button, .hpe-panel .hpe-grid-3 button { align-items: center; display: inline-flex; font-size: 0; justify-content: center; min-height: 34px; padding: 0; }
        .hpe-panel .hpe-grid button::before, .hpe-panel .hpe-grid-3 button::before { background: linear-gradient(135deg, #2563eb 0 45%, #111827 45% 100%); content: ""; display: block; height: 17px; -webkit-mask: var(--hpe-icon) center / contain no-repeat; mask: var(--hpe-icon) center / contain no-repeat; width: 17px; }
        .hpe-panel button[data-action="free"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 4h7v2H7.4l5.1 5.1-1.4 1.4L6 7.4V11H4V4Zm16 0v7h-2V7.4l-5.1 5.1-1.4-1.4L16.6 6H13V4h7ZM4 20v-7h2v3.6l5.1-5.1 1.4 1.4L7.4 18H11v2H4Zm16 0h-7v-2h3.6l-5.1-5.1 1.4-1.4L18 16.6V13h2v7Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="top"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 4h16v2H4V4Zm5 5h10v10H9V9Zm-4 4h10v7H5v-7Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="bottom"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 20h16v-2H4v2Zm5-15h10v10H9V5ZM5 8h10v7H5V8Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="bold"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 4h6.5C16.5 4 18 5.6 18 7.6c0 1.5-.8 2.6-2.1 3.2 1.8.5 2.9 1.8 2.9 3.7 0 2.8-2.1 4.5-5.4 4.5H7V4Zm4 7h2.2c1.4 0 2.2-.7 2.2-1.9 0-1.1-.8-1.8-2.1-1.8H11V11Zm0 5.7h2.7c1.5 0 2.4-.8 2.4-2s-.9-2-2.5-2H11v4Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="left"], .hpe-panel button[data-action="alignLeft"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v2H4V5Zm0 4h11v2H4V9Zm0 4h16v2H4v-2Zm0 4h11v2H4v-2Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="centerText"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v2H4V5Zm3 4h10v2H7V9Zm-3 4h16v2H4v-2Zm3 4h10v2H7v-2Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="alignCenter"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M11 3h2v18h-2V3ZM5 6h14v4H5V6Zm3 8h8v4H8v-4Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="alignMiddle"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 11h18v2H3v-2ZM6 5h4v14H6V5Zm8 3h4v8h-4V8Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="right"], .hpe-panel button[data-action="alignRight"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 5h16v2H4V5Zm5 4h11v2H9V9Zm-5 4h16v2H4v-2Zm5 4h11v2H9v-2Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="alignTop"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 4h16v2H4V4Zm4 5h3v11H8V9Zm6 3h3v8h-3v-8Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="alignBottom"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M4 20h16v-2H4v2Zm4-16h3v11H8V4Zm6 3h3v8h-3V7Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="liUp"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 5h13v2H7V5Zm0 6h13v2H7v-2Zm0 6h13v2H7v-2ZM3 8l3-4 3 4H6v10H4V8H3Z'/%3E%3C/svg%3E"); }
        .hpe-panel button[data-action="liDown"] { --hpe-icon: url("data:image/svg+xml,%3Csvg viewBox='0 0 24 24' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M7 5h13v2H7V5Zm0 6h13v2H7v-2Zm0 6h13v2H7v-2ZM3 16h1V6h2v10h1l-3 4-3-4Z'/%3E%3C/svg%3E"); }
        .hpe-status { color: #667085; font-size: 12px; line-height: 1.45; margin-top: 8px; min-height: 34px; }
        .hpe-statusbar { align-items: center; background: rgba(255,255,255,.96); border-top: 1px solid var(--hpe-border); bottom: 0; color: var(--hpe-muted); display: flex; font-size: 12px; height: var(--hpe-status-height); justify-content: space-between; left: 0; padding: 0 12px; pointer-events: auto; position: fixed; right: 0; }
        .hpe-statusbar-left, .hpe-statusbar-center, .hpe-statusbar-right { align-items: center; display: flex; gap: 10px; min-width: 0; }
        .hpe-statusbar button { align-items: center; background: #fff; border: 1px solid #d0d7e2; border-radius: 6px; color: var(--hpe-text); cursor: pointer; display: inline-flex; height: 24px; min-height: 24px; }
        .hpe-statusbar button:hover { background: #eef5ff; border-color: #cfe1ff; color: var(--hpe-primary); }
        .hpe-page-jump { align-items: center; display: inline-flex; gap: 6px; }
        .hpe-page-jump select { border: 1px solid #d0d7e2; border-radius: 6px; color: var(--hpe-text); font-size: 12px; height: 24px; max-width: 96px; padding: 0 6px; }
        .hpe-zoom-control { align-items: center; display: inline-flex; gap: 6px; }
        .hpe-zoom-control input[type="range"] { accent-color: var(--hpe-primary); width: 92px; }
        .hpe-zoom-text { color: var(--hpe-text); font-variant-numeric: tabular-nums; min-width: 38px; text-align: right; }
        .hpe-dot { background: #20a162; border-radius: 999px; display: inline-block; height: 8px; width: 8px; }
        .hpe-dot.warning { background: var(--hpe-warning, #ff8a00); }
        .hpe-previewbar { align-items: center; background: rgba(255,255,255,.96); border-bottom: 1px solid var(--hpe-border); display: none; height: var(--hpe-top-height); justify-content: space-between; left: 0; padding: 0 16px; pointer-events: auto; position: fixed; right: 0; top: 0; }
        .hpe-preview-title { color: var(--hpe-text); font-size: 14px; font-weight: 600; left: 50%; position: absolute; transform: translateX(-50%); }
        .hpe-export-backdrop { align-items: center; background: rgba(10,26,51,.16); display: none; inset: 0; justify-content: center; pointer-events: auto; position: fixed; z-index: 2147483647; }
        .hpe-export-backdrop.open { display: flex; }
        .hpe-export-modal { background: #fff; border: 1px solid var(--hpe-border); border-radius: 12px; box-shadow: 0 24px 64px rgba(10,26,51,.18); color: var(--hpe-text); padding: 24px 28px 26px; width: min(560px, calc(100vw - 48px)); }
        .hpe-export-modal h2 { align-items: center; display: flex; font-size: 20px; gap: 10px; justify-content: center; margin: 0 0 12px; }
        .hpe-modal-icon { align-items: center; background: var(--hpe-primary); border-radius: 999px; display: inline-flex; height: 38px; justify-content: center; width: 38px; }
        .hpe-modal-icon::before { background: #fff; content: ""; display: block; height: 18px; -webkit-mask: var(--hpe-icon) center / contain no-repeat; mask: var(--hpe-icon) center / contain no-repeat; width: 18px; }
        .hpe-export-modal p { color: var(--hpe-muted); font-size: 13px; line-height: 1.6; margin: 0 0 18px; text-align: center; }
        .hpe-export-rows { border-top: 1px solid var(--hpe-border); margin: 0 0 22px; }
        .hpe-export-row { align-items: center; border-bottom: 1px solid var(--hpe-border); color: var(--hpe-muted); display: flex; font-size: 13px; justify-content: space-between; padding: 12px 0; }
        .hpe-export-row strong { color: var(--hpe-text); font-weight: 500; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .hpe-export-actions { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
        .hpe-export-actions button { justify-content: center; min-height: 40px; }
        .hpe-selection { position: absolute; border: 2px solid #2563eb; box-shadow: 0 0 0 1px rgba(37,99,235,.18); z-index: 2147483645; pointer-events: none; }
        .hpe-selection.editing { border-style: dashed; border-color: #f59e0b; }
        .hpe-selection.hidden { display: none; }
        .hpe-move { position: absolute; left: 50%; top: -29px; transform: translateX(-50%); background: #2563eb; border-radius: 999px; color: #fff; cursor: move !important; font-size: 12px; line-height: 24px; min-width: 60px; padding: 0 10px; pointer-events: auto; text-align: center; user-select: none; }
        .hpe-handle { position: absolute; width: 12px; height: 12px; border: 2px solid #fff; border-radius: 50%; background: #2563eb; pointer-events: auto; }
        .hpe-selection.editing .hpe-handle, .hpe-selection.editing .hpe-move { background: #f59e0b; }
        .hpe-handle.nw { left: -7px; top: -7px; cursor: nwse-resize !important; }
        .hpe-handle.ne { right: -7px; top: -7px; cursor: nesw-resize !important; }
        .hpe-handle.sw { left: -7px; bottom: -7px; cursor: nesw-resize !important; }
        .hpe-handle.se { right: -7px; bottom: -7px; cursor: nwse-resize !important; }
        .hpe-handle.n { left: calc(50% - 6px); top: -7px; cursor: ns-resize !important; }
        .hpe-handle.s { left: calc(50% - 6px); bottom: -7px; cursor: ns-resize !important; }
        .hpe-handle.e { right: -7px; top: calc(50% - 6px); cursor: ew-resize !important; }
        .hpe-handle.w { left: -7px; top: calc(50% - 6px); cursor: ew-resize !important; }
        .hpe-toolbar { display: none !important; }
        .hpe-toolbar.hidden { display: none; }
        .hpe-toolbar button { border: 0; border-radius: 5px; background: transparent; cursor: pointer; font-size: 12px; min-width: 26px; padding: 6px; }
        .hpe-toolbar button:hover { background: #eef4ff; }
        .hpe-toolbar input[type="color"] { border: 0; background: transparent; cursor: pointer; height: 28px; padding: 2px; width: 30px; }
        .hpe-preview .hpe-panel, .hpe-preview .hpe-topbar, .hpe-preview .hpe-appbar, .hpe-preview .hpe-statusbar, .hpe-preview .hpe-selection, .hpe-preview .hpe-toolbar, .hpe-preview .hpe-placement-preview, .hpe-preview .hpe-thumb-rail, .hpe-preview .hpe-thumb-menu, .hpe-preview .hpe-minimap { display: none; }
        .hpe-preview .hpe-previewbar { display: flex; }
        .hpe-progress-backdrop { align-items: center; background: rgba(10,26,51,.42); display: none; inset: 0; justify-content: center; pointer-events: auto; position: fixed; z-index: 2147483647; }
        .hpe-progress-backdrop.open { display: flex; }
        .hpe-progress-modal { background: #fff; border: 1px solid var(--hpe-border); border-radius: 12px; box-shadow: 0 24px 64px rgba(10,26,51,.22); color: var(--hpe-text); padding: 22px 24px; width: min(420px, calc(100vw - 48px)); }
        .hpe-progress-modal h2 { font-size: 18px; margin: 0 0 10px; }
        .hpe-progress-modal p { color: var(--hpe-muted); font-size: 13px; margin: 0 0 14px; }
        .hpe-progress-track { background: #e8eef8; border-radius: 999px; height: 8px; overflow: hidden; }
        .hpe-progress-fill { background: var(--hpe-primary); border-radius: inherit; height: 100%; transition: width .18s ease; width: 0%; }
        .hpe-root.hpe-fullscreen .hpe-previewbar, .hpe-root.hpe-fullscreen .hpe-export-backdrop { display: none !important; }
        .hpe-root.hpe-printing, .hpe-root.hpe-printing * { display: none !important; }
        [data-hpe-print-root] { display: none; }
        @media print {
          @page { size: landscape; margin: 0; }
          [${UI}], .hpe-root, .hpe-selection, .hpe-toolbar, .hpe-placement-preview { display: none !important; }
          html.hpe-printing-active body > :not([data-hpe-print-root]) { display: none !important; }
          [data-hpe-print-root] { display: block !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
          [data-hpe-print-slides] { display: block !important; height: auto !important; max-height: none !important; overflow: visible !important; transform: none !important; width: auto !important; }
          [data-hpe-print-page] { break-after: page !important; display: block !important; opacity: 1 !important; page-break-after: always !important; visibility: visible !important; }
          [data-hpe-print-page]:last-child { break-after: auto !important; page-break-after: auto !important; }
          html.hpe-shell-layout, html.hpe-shell-layout.hpe-editing-active, html.hpe-printing-active { height: auto !important; overflow: visible !important; width: auto !important; }
          html.hpe-shell-layout.hpe-editing-active body, html.hpe-printing-active body { height: auto !important; margin: 0 !important; max-width: none !important; overflow: visible !important; padding: 0 !important; width: auto !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
          html.hpe-shell-layout.hpe-editing-active body > :not([data-hpe-ui]) { zoom: 100% !important; }
          html.hpe-printing-active .reveal, html.hpe-printing-active .slides { height: auto !important; max-height: none !important; overflow: visible !important; position: static !important; transform: none !important; width: auto !important; }
          html.hpe-printing-active [data-hpe-print-slide="true"] { break-after: page !important; display: block !important; float: none !important; margin: 0 auto !important; opacity: 1 !important; page-break-after: always !important; position: relative !important; transform: none !important; visibility: visible !important; }
          html.hpe-printing-active [data-hpe-print-slide="true"]:last-of-type { break-after: auto !important; page-break-after: auto !important; }
        }
        .hpe-placement-preview { position: absolute; width: 260px; height: 56px; border: 2px dashed #f59e0b; background: rgba(245,158,11,.08); box-shadow: 0 0 0 4px rgba(245,158,11,.12); pointer-events: none; z-index: 2147483645; }
        .hpe-placement-preview.hidden { display: none; }
        .hpe-welcome { position: fixed; left: 50%; top: 72px; transform: translateX(-50%); width: min(420px, calc(100vw - 32px)); background: #fff; border: 1px solid #d0d5dd; border-radius: 8px; box-shadow: 0 12px 32px rgba(16,24,40,.18); padding: 16px; pointer-events: auto; z-index: 2147483647; }
        .hpe-welcome h2 { font-size: 16px; margin: 0 0 8px; }
        .hpe-welcome ol { margin: 0 0 12px 20px; padding: 0; }
        .hpe-welcome li { margin: 5px 0; }
        [contenteditable="true"][${EDITABLE}="true"] { outline: none !important; cursor: text !important; }
      `;
      doc.head.appendChild(style);
    }

    function buildUi() {
      const root = doc.createElement("div");
      root.className = "hpe-root";
      root.setAttribute(UI, "true");
      const logo = state.logoUrl
        ? `<img src="${escapeHtml(state.logoUrl)}" alt="">`
        : `<span class="hpe-logo-fallback">P</span>`;
      root.innerHTML = `
        <header class="hpe-appbar" ${UI}="true">
          <div class="hpe-brand">
            <span class="hpe-logo">${logo}</span>
            <span class="hpe-title">HTML-PPT Editor</span>
            <span class="hpe-file" data-field="fileName"></span>
          </div>
          <div class="hpe-appbar-center" data-field="modeTitle">&#32534;&#36753;&#27169;&#24335;</div>
          <div class="hpe-appbar-actions">
            <button data-action="undo" class="hpe-icon-button" type="button" title="&#25764;&#38144; Ctrl+Z"><span class="hpe-button-label">&#25764;&#38144;</span></button>
            <button data-action="redo" class="hpe-icon-button" type="button" title="&#37325;&#20570; Ctrl+Y"><span class="hpe-button-label">&#37325;&#20570;</span></button>
            <button data-action="saveDraft" class="hpe-icon-button" type="button" title="&#20445;&#23384;&#33609;&#31295; Ctrl+S"><span class="hpe-button-label">&#20445;&#23384;</span></button>
            <span class="hpe-save-feedback" data-field="saveFeedback" aria-live="polite"></span>
          </div>
        </header>
        <header class="hpe-previewbar" ${UI}="true">
          <div class="hpe-brand">
            <span class="hpe-logo">${logo}</span>
            <span class="hpe-title">HTML-PPT Editor</span>
          </div>
          <div class="hpe-preview-title">&#39044;&#35272;&#27169;&#24335;</div>
          <div class="hpe-appbar-actions">
            <button data-action="edit" class="hpe-icon-button" type="button"><span class="hpe-button-label">&#36820;&#22238;&#32534;&#36753;</span></button>
            <button data-action="confirmExport" class="hpe-icon-button primary" type="button"><span class="hpe-button-label">&#30830;&#35748;&#23548;&#20986;</span></button>
          </div>
        </header>
        <aside class="hpe-thumb-rail" ${UI}="true" aria-label="Page thumbnails">
          <button class="hpe-thumb-toggle" data-action="toggleThumbnails" type="button" title="收起或展开缩略图"></button>
          <div class="hpe-thumb-list" data-field="thumbList"></div>
        </aside>
        <div class="hpe-thumb-menu" ${UI}="true" data-field="thumbMenu">
          <button data-action="deleteThumbPage" type="button">删除页面</button>
        </div>
        <div class="hpe-topbar" ${UI}="true" aria-label="HTML-PPT Editor toolbar">
          <div class="hpe-tool-group">
            <button data-action="edit" type="button" title="选择元素">选择</button>
            <button data-action="prevSlide" type="button" title="上一页 PageUp">上页</button>
            <button data-action="nextSlide" type="button" title="下一页 PageDown">下页</button>
            <button data-action="togglePanel" type="button" title="展开或收起属性">属性</button>
          </div>
          <div class="hpe-tool-group">
            <button data-action="addText" type="button" title="新增文本框">文本</button>
            <button data-action="copy" type="button" title="复制元素 Ctrl+C">复制</button>
            <button data-action="delete" class="danger" type="button" title="可撤销删除">删除</button>
          </div>
          <div class="hpe-tool-group">
            <button data-action="bold" type="button" title="加粗 Ctrl+B">加粗</button>
            <button data-action="left" type="button" title="左对齐 Ctrl+L">左齐</button>
            <button data-action="centerText" type="button" title="居中 Ctrl+E">居中</button>
            <button data-action="right" type="button" title="右对齐 Ctrl+R">右齐</button>
          </div>
          <div class="hpe-tool-group">
            <button data-action="undo" type="button" title="撤销 Ctrl+Z">撤销</button>
            <button data-action="redo" type="button" title="重做 Ctrl+Y">重做</button>
          </div>
          <div class="hpe-tool-group">
            <button data-action="exportPreview" class="primary" type="button" title="预览后导出 HTML">导出</button>
            <button data-action="exportPdf" type="button" title="&#25171;&#24320;&#25171;&#21360;&#31383;&#21475;&#24182;&#21478;&#23384;&#20026; PDF">PDF</button>
          </div>
        </div>
        <aside class="hpe-panel" ${UI}="true">
          <div class="hpe-panel-tabs"><span class="active">属性</span></div>
          <div class="hpe-panel-header" data-panel-drag>
            <h2>&#23646;&#24615;</h2>
            <div class="hpe-panel-actions">
              <button data-action="resetPanel" type="button" title="&#22238;&#21040;&#21491;&#20391;">&#24402;&#20301;</button>
              <button data-action="togglePanel" class="hpe-icon-button hpe-icon-only" type="button" title="&#25910;&#36215;&#23646;&#24615;&#38754;&#26495;"><span class="hpe-button-label">&#25910;&#36215;</span></button>
            </div>
          </div>
          <div class="hpe-field">
            <label>&#39029;&#38754;</label>
            <select data-field="slide"></select>
          </div>
          <div class="hpe-status" data-field="summary">&#26410;&#36873;&#20013;&#20803;&#32032;</div>

          <h3>&#25991;&#23383;</h3>
          <div class="hpe-field"><label>&#23383;&#20307;</label><select data-field="font"></select></div>
          <div class="hpe-field"><label>&#23383;&#21495;</label><input data-field="fontSize" type="number"></div>
          <div class="hpe-field"><label>&#39068;&#33394;</label><input data-field="color" type="color"></div>
          <div class="hpe-grid">
            <button data-action="bold" type="button" title="&#21152;&#31895;">&#21152;&#31895;</button>
            <button data-action="left" type="button" title="&#24038;&#23545;&#40784;">&#24038;&#23545;&#40784;</button>
            <button data-action="centerText" type="button" title="&#25991;&#23383;&#23621;&#20013;">&#23621;&#20013;</button>
            <button data-action="right" type="button" title="&#21491;&#23545;&#40784;">&#21491;&#23545;&#40784;</button>
          </div>

          <h3>&#20301;&#32622;&#23610;&#23544;</h3>
          <div class="hpe-field"><label>X</label><input data-field="x" type="number"></div>
          <div class="hpe-field"><label>Y</label><input data-field="y" type="number"></div>
          <div class="hpe-field"><label>&#23485;</label><input data-field="w" type="number"></div>
          <div class="hpe-field"><label>&#39640;</label><input data-field="h" type="number"></div>
          <div class="hpe-grid">
            <button data-action="free" type="button" title="&#21551;&#29992;&#33258;&#30001;&#23450;&#20301;">&#33258;&#30001;&#23450;&#20301;</button>
            <button data-action="top" type="button" title="&#32622;&#20110;&#39030;&#23618;">&#32622;&#39030;</button>
            <button data-action="bottom" type="button" title="&#32622;&#20110;&#24213;&#23618;">&#32622;&#24213;</button>
          </div>

          <h3>&#23545;&#40784;</h3>
          <div class="hpe-grid-3">
            <button data-action="alignLeft" type="button" title="&#24038;&#23545;&#40784;">&#24038;</button>
            <button data-action="alignCenter" type="button" title="&#27700;&#24179;&#23621;&#20013;">&#20013;</button>
            <button data-action="alignRight" type="button" title="&#21491;&#23545;&#40784;">&#21491;</button>
            <button data-action="alignTop" type="button" title="&#39030;&#37096;&#23545;&#40784;">&#19978;</button>
            <button data-action="alignMiddle" type="button" title="&#22402;&#30452;&#23621;&#20013;">&#20013;</button>
            <button data-action="alignBottom" type="button" title="&#24213;&#37096;&#23545;&#40784;">&#19979;</button>
          </div>

          <h3>&#21015;&#34920;</h3>
          <div class="hpe-grid">
            <button data-action="liUp" type="button" title="&#26465;&#30446;&#19978;&#31227;">&#19978;&#31227;</button>
            <button data-action="liDown" type="button" title="&#26465;&#30446;&#19979;&#31227;">&#19979;&#31227;</button>
          </div>
        </aside>
        <footer class="hpe-statusbar" ${UI}="true">
          <div class="hpe-statusbar-left">
            <span><span class="hpe-dot"></span> <span data-field="statusMode">&#32534;&#36753;&#27169;&#24335;</span></span>
            <span data-field="draftStatus">&#33609;&#31295;&#24050;&#20445;&#23384;</span>
          </div>
          <div class="hpe-statusbar-center" data-field="pageStatus"></div>
          <div class="hpe-statusbar-right">
            <span><span class="hpe-dot warning"></span> <span data-field="changeStatus">&#20462;&#25913; 0 &#22788;</span></span>
            <label class="hpe-page-jump"><span>&#39029;&#30721;</span><select data-field="statusSlide" title="&#20999;&#25442;&#39029;&#38754;"></select></label>
            <span class="hpe-zoom-control">
              <button data-action="zoomOut" class="hpe-icon-button hpe-icon-only" type="button" title="&#32553;&#23567;"><span class="hpe-button-label">&#32553;&#23567;</span></button>
              <input data-field="zoom" type="range" min="10" max="100" step="10" value="100" title="&#21407;&#32593;&#39029;&#26174;&#31034;&#27604;&#20363;">
              <span data-field="zoomText" class="hpe-zoom-text">100%</span>
              <button data-action="zoomIn" class="hpe-icon-button hpe-icon-only" type="button" title="&#25918;&#22823;"><span class="hpe-button-label">&#25918;&#22823;</span></button>
            </span>
            <button data-action="fullscreen" class="hpe-icon-button hpe-icon-only" type="button" title="&#20840;&#23631;&#25773;&#25918;"><span class="hpe-button-label">&#20840;&#23631;</span></button>
          </div>
        </footer>
        <div class="hpe-export-backdrop" ${UI}="true">
          <section class="hpe-export-modal" role="dialog" aria-modal="true" aria-label="&#23548;&#20986;&#30830;&#35748;">
            <h2><span class="hpe-modal-icon hpe-icon-button" data-action="confirmExport" aria-hidden="true"></span><span>&#23548;&#20986;&#30830;&#35748;</span></h2>
            <p>&#39044;&#35272;&#30830;&#35748;&#21518;&#65292;&#21487;&#20197;&#23548;&#20986;&#26032;&#30340; HTML &#25991;&#20214;&#65292;&#25110;&#30452;&#25509;&#29983;&#25104;&#25972;&#20221; PDF&#12290;</p>
            <div class="hpe-export-rows">
              <div class="hpe-export-row"><span>&#25991;&#20214;&#21517;</span><strong data-field="exportFile"></strong></div>
              <div class="hpe-export-row"><span>&#24403;&#21069;&#20462;&#25913;&#25968;&#37327;</span><strong data-field="exportChanges"></strong></div>
              <div class="hpe-export-row"><span>PDF &#26041;&#24335;</span><strong>&#25554;&#20214;&#20869;&#29983;&#25104;&#25972;&#20221; PDF</strong></div>
            </div>
            <div class="hpe-export-actions">
              <button data-action="downloadExport" class="hpe-icon-button primary" type="button"><span class="hpe-button-label">&#23548;&#20986; HTML</span></button>
              <button data-action="exportPdf" class="hpe-icon-button" type="button"><span class="hpe-button-label">&#20445;&#23384;&#20026; PDF</span></button>
              <button data-action="closeExportModal" class="hpe-icon-button" type="button"><span class="hpe-button-label">&#36820;&#22238;&#32534;&#36753;</span></button>
            </div>
          </section>
        </div>
        <div class="hpe-selection hidden" ${UI}="true">
          <div class="hpe-move">移动</div>
          <div class="hpe-handle nw" data-handle="nw"></div>
          <div class="hpe-handle n" data-handle="n"></div>
          <div class="hpe-handle ne" data-handle="ne"></div>
          <div class="hpe-handle e" data-handle="e"></div>
          <div class="hpe-handle se" data-handle="se"></div>
          <div class="hpe-handle s" data-handle="s"></div>
          <div class="hpe-handle sw" data-handle="sw"></div>
          <div class="hpe-handle w" data-handle="w"></div>
        </div>
        <div class="hpe-toolbar hidden" ${UI}="true">
          <button data-action="editText" type="button">文字</button>
          <button data-action="bold" type="button">B</button>
          <input data-mini-color type="color" title="修改选中文字或当前元素颜色">
          <button data-action="left" type="button">左</button>
          <button data-action="centerText" type="button">中</button>
          <button data-action="right" type="button">右</button>
        </div>
        <div class="hpe-placement-preview hidden" ${UI}="true"></div>
        <div class="hpe-minimap" ${UI}="true">
          <div class="hpe-minimap-track" data-field="minimapTrack">
            <div class="hpe-minimap-content" data-field="minimapContent"></div>
            <div class="hpe-minimap-window" data-field="minimapWindow"></div>
          </div>
        </div>
        <div class="hpe-progress-backdrop" ${UI}="true">
          <section class="hpe-progress-modal" role="status" aria-live="polite">
            <h2>&#27491;&#22312;&#29983;&#25104; PDF</h2>
            <p data-field="pdfProgressText">&#20934;&#22791;&#20013;...</p>
            <div class="hpe-progress-track"><div class="hpe-progress-fill" data-field="pdfProgressBar"></div></div>
          </section>
        </div>
        <button class="hpe-panel-tab hpe-icon-button hpe-icon-only" data-action="togglePanel" type="button" ${UI}="true"><span class="hpe-button-label">属性</span></button>
      `;
      doc.body.appendChild(root);
      return {
        root,
        appbar: root.querySelector(".hpe-appbar"),
        previewbar: root.querySelector(".hpe-previewbar"),
        panel: root.querySelector(".hpe-panel"),
        thumbRail: root.querySelector(".hpe-thumb-rail"),
        thumbMenu: root.querySelector(".hpe-thumb-menu"),
        minimap: root.querySelector(".hpe-minimap"),
        panelHeader: root.querySelector("[data-panel-drag]"),
        panelTab: root.querySelector(".hpe-panel-tab"),
        topbar: root.querySelector(".hpe-topbar"),
        selection: root.querySelector(".hpe-selection"),
        toolbar: root.querySelector(".hpe-toolbar"),
        placement: root.querySelector(".hpe-placement-preview"),
        exportBackdrop: root.querySelector(".hpe-export-backdrop"),
        pdfProgressBackdrop: root.querySelector(".hpe-progress-backdrop"),
        miniColor: root.querySelector("[data-mini-color]"),
        fields: {
          fileName: root.querySelector('[data-field="fileName"]'),
          modeTitle: root.querySelector('[data-field="modeTitle"]'),
          saveFeedback: root.querySelector('[data-field="saveFeedback"]'),
          statusMode: root.querySelector('[data-field="statusMode"]'),
          draftStatus: root.querySelector('[data-field="draftStatus"]'),
          pageStatus: root.querySelector('[data-field="pageStatus"]'),
          statusSlide: root.querySelector('[data-field="statusSlide"]'),
          changeStatus: root.querySelector('[data-field="changeStatus"]'),
          exportFile: root.querySelector('[data-field="exportFile"]'),
          exportChanges: root.querySelector('[data-field="exportChanges"]'),
          slide: root.querySelector('[data-field="slide"]'),
          summary: root.querySelector('[data-field="summary"]'),
          x: root.querySelector('[data-field="x"]'),
          y: root.querySelector('[data-field="y"]'),
          w: root.querySelector('[data-field="w"]'),
          h: root.querySelector('[data-field="h"]'),
          font: root.querySelector('[data-field="font"]'),
          fontSize: root.querySelector('[data-field="fontSize"]'),
          color: root.querySelector('[data-field="color"]'),
          zoom: root.querySelector('[data-field="zoom"]'),
          zoomText: root.querySelector('[data-field="zoomText"]'),
          thumbList: root.querySelector('[data-field="thumbList"]'),
          minimapTrack: root.querySelector('[data-field="minimapTrack"]'),
          minimapContent: root.querySelector('[data-field="minimapContent"]'),
          minimapWindow: root.querySelector('[data-field="minimapWindow"]'),
          pdfProgressText: root.querySelector('[data-field="pdfProgressText"]'),
          pdfProgressBar: root.querySelector('[data-field="pdfProgressBar"]')
        }
      };
    }

    function bindEvents() {
      doc.addEventListener("click", onDocumentClick, true);
      doc.addEventListener("dblclick", onDocumentDoubleClick, true);
      doc.addEventListener("input", onEditableInput, true);
      doc.addEventListener("blur", onEditableBlur, true);
      doc.addEventListener("keydown", onKeyDown, true);
      doc.addEventListener("pointermove", onDocumentPointerMove, true);
      doc.addEventListener("selectionchange", rememberTextSelection);
      win.addEventListener("scroll", () => {
        scheduleSelectionUpdate();
        scheduleFloatingAdapt();
        onEditorScroll();
      }, true);
      win.addEventListener("resize", () => {
        scheduleSelectionUpdate();
        scheduleFloatingAdapt();
      });
      ui.root.addEventListener("click", onUiClick);
      ui.fields.thumbList.addEventListener("click", onThumbnailClick);
      ui.fields.thumbList.addEventListener("contextmenu", onThumbnailContextMenu);
      ui.fields.thumbList.addEventListener("dragstart", onThumbnailDragStart);
      ui.fields.thumbList.addEventListener("dragover", onThumbnailDragOver);
      ui.fields.thumbList.addEventListener("drop", onThumbnailDrop);
      ui.minimap.addEventListener("mouseenter", () => {
        state.minimapHover = true;
        showMinimap();
      });
      ui.minimap.addEventListener("mouseleave", () => {
        state.minimapHover = false;
        scheduleMinimapHide();
      });
      ui.fields.minimapTrack.addEventListener("click", onMinimapClick);
      ui.fields.minimapTrack.addEventListener("pointerdown", onMinimapPointerDown);
      doc.addEventListener("pointermove", onMinimapPointerMove);
      doc.addEventListener("pointerup", onMinimapPointerUp);
      if (!state.reserveWorkspace) ui.panelHeader.addEventListener("pointerdown", startPanelDrag);
      ui.miniColor.addEventListener("change", () => applyField("color", ui.miniColor.value));
      ui.selection.querySelector(".hpe-move").addEventListener("pointerdown", startMove);
      ui.selection.querySelectorAll(".hpe-handle").forEach((handle) => {
        handle.addEventListener("pointerdown", startResize);
      });
      Object.entries(ui.fields).forEach(([name, field]) => {
        if (!field || ["summary", "slide", "statusSlide"].includes(name)) return;
        field.addEventListener("change", () => applyField(name, field.value));
      });
      ui.fields.slide.addEventListener("change", () => goToSlide(Number(ui.fields.slide.value)));
      ui.fields.statusSlide.addEventListener("change", () => goToSlide(Number(ui.fields.statusSlide.value)));
      ui.fields.zoom.addEventListener("input", () => setCanvasZoom(Number(ui.fields.zoom.value) || 100));
      doc.addEventListener("fullscreenchange", onFullscreenChange);
    }

    function destroy() {
      doc.removeEventListener("click", onDocumentClick, true);
      doc.removeEventListener("dblclick", onDocumentDoubleClick, true);
      doc.removeEventListener("input", onEditableInput, true);
      doc.removeEventListener("blur", onEditableBlur, true);
      doc.removeEventListener("keydown", onKeyDown, true);
      doc.removeEventListener("pointermove", onDocumentPointerMove, true);
      doc.removeEventListener("pointermove", onMinimapPointerMove);
      doc.removeEventListener("pointerup", onMinimapPointerUp);
      doc.removeEventListener("selectionchange", rememberTextSelection);
      doc.removeEventListener("fullscreenchange", onFullscreenChange);
      restoreFloatingElements();
      clearTimeout(state.minimapTimer);
      ui.root.remove();
      doc.getElementById("hpe-editor-style")?.remove();
      doc.documentElement.classList.remove("hpe-editing-active");
      doc.documentElement.classList.remove("hpe-shell-layout", "hpe-panel-collapsed");
      restorePointerDecorations();
    }

    function onDocumentClick(event) {
      if (state.mode !== "edit") return;
      if (event.target.closest?.(`[${UI}]`)) return;
      hideThumbnailMenu();
      state.thumbSelectionActive = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      if (state.placingText) {
        addTextBox(event.clientX + win.scrollX, event.clientY + win.scrollY);
        state.placingText = false;
        updatePlacementPreview();
        return;
      }
      const target = getSelectable(event.target);
      if (target) select(target);
      else clearSelection();
    }

    function onDocumentDoubleClick(event) {
      if (state.mode !== "edit") return;
      if (event.target.closest?.(`[${UI}]`)) return;
      const target = getSelectable(event.target);
      if (target && isTextElement(target)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        select(target);
        beginTextEdit();
      }
    }

    function onDocumentPointerMove(event) {
      if (!state.placingText || event.target.closest?.(`[${UI}]`)) return;
      state.placementX = event.clientX + win.scrollX;
      state.placementY = event.clientY + win.scrollY;
      updatePlacementPreview();
    }

    function onEditableInput(event) {
      if (event.target !== state.selected) return;
      scheduleDraft();
      updateSelectionBox();
    }

    function onEditableBlur(event) {
      if (event.target !== state.selected) return;
      const after = event.target.outerHTML;
      if (state.beforeEdit && state.beforeEdit !== after) {
        pushChange("文本修改", event.target, state.beforeEdit, after);
      }
      state.beforeEdit = "";
      updatePanel();
    }

    function onKeyDown(event) {
      if (state.fullscreen && state.mode === "preview") {
        if (["ArrowRight", "PageDown", " "].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          goRelativeSlide(1);
          return;
        }
        if (["ArrowLeft", "PageUp"].includes(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          event.stopImmediatePropagation();
          goRelativeSlide(-1);
          return;
        }
      }
      if (state.mode !== "edit") return;
      const mod = event.ctrlKey || event.metaKey;
      const typing = isTyping(event.target);
      if (mod && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        event.shiftKey ? redo() : undo();
        return;
      }
      if (mod && event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        redo();
        return;
      }
      if (mod && event.key.toLowerCase() === "c" && state.selected && !typing) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        copySelected();
        return;
      }
      if (mod && event.key.toLowerCase() === "b" && state.selected) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        toggleBold();
        return;
      }
      if (mod && event.key.toLowerCase() === "l" && state.selected) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setTextAlign("left");
        return;
      }
      if (mod && event.key.toLowerCase() === "e" && state.selected) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setTextAlign("center");
        return;
      }
      if (mod && event.key.toLowerCase() === "r" && state.selected) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        setTextAlign("right");
        return;
      }
      if (mod && event.key.toLowerCase() === "s") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        saveDraftNow({ feedback: true });
        return;
      }
      if (event.key === "F5") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        enterFullscreen();
        return;
      }
      if (event.key === "Escape" && state.placingText) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        state.placingText = false;
        updatePlacementPreview();
        setStatus("已退出文本框插入。");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        hideThumbnailMenu();
        state.thumbSelectionActive = false;
        if (typing) endTextEdit();
        clearSelection();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && state.thumbSelectionActive && !state.selected && !typing) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        deleteSlide(state.activeSlideIndex);
        return;
      }
      if (typing && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
        event.stopPropagation();
        event.stopImmediatePropagation();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && state.selected && !typing) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        deleteSelected();
        return;
      }
      if (event.key.startsWith("Arrow") && state.selected && !typing) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        nudge(event.key, event.shiftKey ? 10 : 1);
        return;
      }
      if (!typing && event.key === "PageUp") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        goRelativeSlide(-1);
        return;
      }
      if (!typing && event.key === "PageDown") {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        goRelativeSlide(1);
        return;
      }
      if (!typing && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "PageUp", "PageDown", "Home", "End"].includes(event.key)) {
        event.stopPropagation();
        event.stopImmediatePropagation();
      }
    }

    function onUiClick(event) {
      const button = event.target.closest("button[data-action]");
      if (!button) return;
      event.preventDefault();
      event.stopPropagation();
      runAction(button.dataset.action);
      if (!button.closest(".hpe-thumb-menu")) hideThumbnailMenu();
    }

    function runAction(action) {
      const actions = {
        edit: setEditMode,
        preview: setPreviewMode,
        undo,
        redo,
        saveDraft: () => saveDraftNow({ feedback: true }),
        prevSlide: () => goRelativeSlide(-1),
        nextSlide: () => goRelativeSlide(1),
        addText: startTextPlacement,
        copy: copySelected,
        delete: deleteSelected,
        exportPreview: () => {
          setPreviewMode();
          setStatus("预览无误后，点击确认导出。");
        },
        confirmExport: showExportModal,
        downloadExport: exportHtml,
        exportPdf: () => exportPdf({ currentOnly: false }),
        closeExportModal: () => {
          hideExportModal();
          setEditMode();
        },
        diagnostics: exportDiagnostics,
        togglePanel,
        toggleThumbnails,
        deleteThumbPage: () => deleteSlide(Number.isInteger(state.thumbMenuIndex) ? state.thumbMenuIndex : state.activeSlideIndex),
        resetPanel,
        editText: beginTextEdit,
        bold: toggleBold,
        left: () => setTextAlign("left"),
        centerText: () => setTextAlign("center"),
        right: () => setTextAlign("right"),
        free: enableFreePosition,
        top: bringToTop,
        bottom: sendToBottom,
        alignLeft: () => alignSelected("left"),
        alignCenter: () => alignSelected("center"),
        alignRight: () => alignSelected("right"),
        alignTop: () => alignSelected("top"),
        alignMiddle: () => alignSelected("middle"),
        alignBottom: () => alignSelected("bottom"),
        liUp: () => moveListItem(-1),
        liDown: () => moveListItem(1),
        zoomOut: () => setCanvasZoom(state.zoom - 10),
        zoomIn: () => setCanvasZoom(state.zoom + 10),
        fullscreen: enterFullscreen
      };
      actions[action]?.();
    }

    function getSelectable(node) {
      if (!node || node.nodeType !== 1) return null;
      const blocked = node.closest("html, body, script, style, link, meta, title");
      if (blocked && ["HTML", "BODY"].includes(blocked.tagName)) {
        const candidate = node.closest("p,h1,h2,h3,h4,h5,h6,span,div,section,article,li,button,a,img,svg");
        return candidate && candidate !== doc.body && !isLargeContainer(candidate) ? promoteIconTextGroup(candidate) : null;
      }
      if (isLargeContainer(node)) return null;
      return promoteIconTextGroup(node);
    }

    function promoteIconTextGroup(el) {
      let current = el;
      for (let depth = 0; depth < 3 && current?.parentElement; depth += 1) {
        const parent = current.parentElement;
        if (parent === doc.body || parent.closest(`[${UI}]`) || state.slides.includes(parent) || isLargeContainer(parent)) break;
        if (hasIconAndText(parent)) {
          current = parent;
          continue;
        }
        if (current !== el) return current;
        current = parent;
      }
      if (current !== el && hasIconAndText(current)) return current;
      return el;
    }

    function hasIconAndText(el) {
      const text = (el.innerText || el.textContent || "").trim();
      if (!text || text.length > 180) return false;
      if (el.children.length > 8) return false;
      return Boolean(el.querySelector("svg,img,i,[class*='icon'],[class*='Icon'],[class*='ico'],[class*='Icon']"));
    }

    function select(el) {
      if (!el || el.closest(`[${UI}]`)) return;
      el = promoteIconTextGroup(el);
      if (state.selected && state.selected !== el) endTextEdit();
      state.selected = el;
      ensureId(el);
      updateSelectionBox();
      updatePanel();
      log("select", { tag: el.tagName });
    }

    function clearSelection() {
      endTextEdit();
      state.selected = null;
      state.savedRange = null;
      updateSelectionBox();
      updatePanel();
    }

    function beginTextEdit() {
      if (!state.selected || !isTextElement(state.selected)) return;
      state.selected.setAttribute("contenteditable", "true");
      state.selected.setAttribute(EDITABLE, "true");
      state.beforeEdit = state.selected.outerHTML;
      state.selected.focus();
      placeCaretAtEnd(state.selected);
      updateSelectionBox();
    }

    function rememberTextSelection() {
      if (!state.selected || state.selected.getAttribute(EDITABLE) !== "true") return;
      const selection = win.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
      const range = selection.getRangeAt(0);
      if (state.selected.contains(range.commonAncestorContainer)) {
        state.savedRange = range.cloneRange();
      }
    }

    function applyInlineStyleToSavedRange(styleMap) {
      if (!state.selected || !state.savedRange) return false;
      const range = state.savedRange;
      if (!state.selected.contains(range.commonAncestorContainer) || range.collapsed) return false;
      const span = doc.createElement("span");
      Object.assign(span.style, styleMap);
      try {
        span.appendChild(range.extractContents());
        range.insertNode(span);
        const selection = win.getSelection();
        selection.removeAllRanges();
        const nextRange = doc.createRange();
        nextRange.selectNodeContents(span);
        selection.addRange(nextRange);
        state.savedRange = nextRange.cloneRange();
        return true;
      } catch (error) {
        log("inline_style_failed", { message: error.message });
        return false;
      }
    }

    function savedRangeIsBold() {
      if (!state.selected || !state.savedRange) return false;
      const node = state.savedRange.commonAncestorContainer;
      const el = node.nodeType === 1 ? node : node.parentElement || node.parentNode;
      if (!el || !state.selected.contains(el)) return false;
      return Number(win.getComputedStyle(el).fontWeight) >= 600;
    }

    function endTextEdit() {
      if (!state.selected) return;
      if (state.selected.getAttribute(EDITABLE) === "true") {
        state.selected.removeAttribute("contenteditable");
        state.selected.removeAttribute(EDITABLE);
      }
    }

    function isTextElement(el) {
      if (!el || el.tagName === "IMG" || el.tagName === "VIDEO" || el.tagName === "CANVAS" || el.tagName === "IFRAME") return false;
      return Boolean((el.innerText || "").trim()) || ["P", "SPAN", "DIV", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BUTTON", "A"].includes(el.tagName);
    }

    function isLargeContainer(el) {
      if (!el || el === doc.body || el === doc.documentElement) return true;
      if (state.slides.includes(el)) return true;
      const rect = el.getBoundingClientRect();
      const viewportArea = win.innerWidth * win.innerHeight;
      const area = rect.width * rect.height;
      return area > viewportArea * 0.55 && el.children.length > 1;
    }

    function isTyping(target) {
      return target?.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName);
    }

    function startTextPlacement() {
      state.placingText = true;
      state.placementX = win.scrollX + Math.max(80, (win.innerWidth - sideWorkspaceWidth()) / 2 - 130);
      state.placementY = win.scrollY + Math.max(80, win.innerHeight / 2 - 28);
      updatePlacementPreview();
      setStatus("点击页面中的位置，放置新的文本框。");
    }

    function updatePlacementPreview() {
      if (!ui.placement) return;
      if (!state.placingText || state.mode !== "edit") {
        ui.placement.classList.add("hidden");
        return;
      }
      ui.placement.classList.remove("hidden");
      ui.placement.style.left = `${state.placementX}px`;
      ui.placement.style.top = `${state.placementY}px`;
    }

    function updateSelectionBox() {
      const el = state.selected;
      if (!el || !doc.body.contains(el) || state.mode !== "edit") {
        ui.selection.classList.add("hidden");
        ui.toolbar.classList.add("hidden");
        return;
      }
      const rect = el.getBoundingClientRect();
      const left = rect.left + win.scrollX;
      const top = rect.top + win.scrollY;
      const availableRight = win.scrollX + win.innerWidth - sideWorkspaceWidth() - 10;
      const visibleWidth = Math.max(1, Math.min(rect.width, availableRight - left));
      ui.selection.classList.remove("hidden");
      ui.selection.classList.toggle("editing", el.getAttribute(EDITABLE) === "true");
      ui.selection.style.left = `${left}px`;
      ui.selection.style.top = `${top}px`;
      ui.selection.style.width = `${visibleWidth}px`;
      ui.selection.style.height = `${Math.max(rect.height, 1)}px`;
      ui.toolbar.classList.add("hidden");
    }

    function sideWorkspaceWidth() {
      return ui.root.classList.contains("panel-collapsed") ? 64 : 352;
    }

    function scheduleSelectionUpdate() {
      win.requestAnimationFrame(updateSelectionBox);
    }

    function scheduleFloatingAdapt() {
      if (state.mode !== "edit") return;
      if (state.floatingTimer) win.cancelAnimationFrame(state.floatingTimer);
      state.floatingTimer = win.requestAnimationFrame(() => {
        state.floatingTimer = null;
        adaptFloatingElements();
      });
    }

    function adaptFloatingElements() {
      restoreFloatingElements();
      if (!state.reserveWorkspace || state.mode !== "edit") return;
      const side = sideWorkspaceWidth();
      const topBar = 56;
      const statusBar = 32;
      const scale = Math.max(0.1, state.zoom / 100);
      const viewportRight = win.innerWidth - side;
      const viewportBottom = win.innerHeight - statusBar;
      const viewportWidth = Math.max(80, viewportRight);
      const allFloating = Array.from(doc.body.querySelectorAll("*")).filter((el) => {
        if (el.closest?.(`[${UI}]`)) return false;
        if (["SCRIPT", "STYLE", "LINK", "META", "TITLE"].includes(el.tagName)) return false;
        const styles = win.getComputedStyle(el);
        if (!["fixed", "sticky"].includes(styles.position)) return false;
        const rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      });
      const floatingSet = new Set(allFloating);
      allFloating.filter((el) => !hasFloatingAncestor(el, floatingSet)).forEach((el) => {
        const styles = win.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const originalStyle = el.getAttribute("style");
        state.floatingRecords.push({ el, style: originalStyle });
        el.setAttribute(FLOATING, "true");
        el.style.maxWidth = `${Math.max(80, viewportWidth - 16) / scale}px`;
        el.style.boxSizing = "border-box";

        if (styles.position === "fixed") {
          if (rect.top < topBar + 4 && styles.top !== "auto") {
            el.style.top = `${(topBar + 4) / scale}px`;
          }
          if (rect.bottom > viewportBottom - 4 && styles.bottom !== "auto") {
            el.style.bottom = `${(statusBar + 4) / scale}px`;
          }
          if (rect.right > viewportRight - 8) {
            const centered = styles.transform !== "none" && Math.abs(rect.left + rect.width / 2 - win.innerWidth / 2) < win.innerWidth * 0.2;
            if (centered) {
              el.style.left = `${Math.max(8, viewportRight / 2) / scale}px`;
              el.style.right = "auto";
            } else if (styles.right !== "auto") {
              el.style.right = `${(side + 8) / scale}px`;
            } else {
              el.style.left = `${Math.max(8, viewportRight - rect.width - 8) / scale}px`;
              el.style.right = "auto";
            }
          }
          if (rect.left < 8 && styles.left !== "auto") {
            el.style.left = `${8 / scale}px`;
          }
        }

        if (styles.position === "sticky" && rect.top < topBar + 4 && styles.top !== "auto") {
          el.style.top = `${(topBar + 4) / scale}px`;
        }
      });
    }

    function hasFloatingAncestor(el, floatingSet) {
      let parent = el.parentElement;
      while (parent && parent !== doc.body) {
        if (floatingSet.has(parent)) return true;
        parent = parent.parentElement;
      }
      return false;
    }

    function restoreFloatingElements() {
      state.floatingRecords.forEach(({ el, style }) => {
        if (!el || !doc.documentElement.contains(el)) return;
        if (style === null) el.removeAttribute("style");
        else el.setAttribute("style", style);
        el.removeAttribute(FLOATING);
      });
      state.floatingRecords = [];
    }

    function updatePanel() {
      const el = state.selected;
      populateFonts();
      updateStatusBar();
      if (!el || !doc.body.contains(el)) {
        ui.fields.summary.textContent = `未选中元素。${getPageMode()}。`;
        ["x", "y", "w", "h", "fontSize"].forEach((key) => (ui.fields[key].value = ""));
        return;
      }
      const rect = el.getBoundingClientRect();
      const styles = win.getComputedStyle(el);
      const editState = el.getAttribute(EDITABLE) === "true" ? "编辑态" : "选中态";
      ui.fields.summary.textContent = `${elementLabel(el)} · ${editState} · ${getPageMode()} · 修改 ${changedObjectCount()} 处`;
      ui.fields.x.value = Math.round(rect.left + win.scrollX);
      ui.fields.y.value = Math.round(rect.top + win.scrollY);
      ui.fields.w.value = Math.round(rect.width);
      ui.fields.h.value = Math.round(rect.height);
      ui.fields.fontSize.value = Math.round(parseFloat(styles.fontSize) || 16);
      ui.fields.color.value = rgbToHex(styles.color);
      ui.miniColor.value = ui.fields.color.value;
      ui.fields.font.value = normalizeFont(styles.fontFamily);
    }

    function setStatus(message) {
      ui.fields.summary.textContent = message;
      ui.fields.draftStatus.textContent = message || "草稿已保存";
      updateStatusBar();
    }

    function setSaveFeedback(message, isError = false) {
      if (!ui.fields.saveFeedback) return;
      clearTimeout(state.feedbackTimer);
      ui.fields.saveFeedback.textContent = message;
      ui.fields.saveFeedback.classList.toggle("error", isError);
      ui.fields.saveFeedback.classList.add("visible");
      state.feedbackTimer = win.setTimeout(() => {
        ui.fields.saveFeedback.classList.remove("visible");
      }, 1600);
    }

    function updateStatusBar() {
      ui.fields.fileName.textContent = state.sourceName;
      ui.fields.modeTitle.textContent = state.mode === "preview" ? "预览模式" : "编辑模式";
      ui.fields.statusMode.textContent = state.mode === "preview" ? "预览模式" : "编辑模式";
      ui.fields.pageStatus.textContent = state.slides.length
        ? `第 ${state.activeSlideIndex + 1} 页 / 共 ${state.slides.length} 页`
        : "长页面模式";
      ui.fields.changeStatus.textContent = `修改 ${changedObjectCount()} 处`;
      ui.fields.zoom.value = String(state.zoom);
      ui.fields.zoomText.textContent = `${state.zoom}%`;
      syncSlideSelectors(state.activeSlideIndex);
    }

    function syncSlideSelectors(index) {
      const value = String(Math.max(0, index || 0));
      [ui.fields.slide, ui.fields.statusSlide].forEach((select) => {
        if (!select) return;
        select.value = value;
        const selectedIndex = Array.from(select.options).findIndex((option) => option.value === value);
        if (selectedIndex >= 0) select.selectedIndex = selectedIndex;
      });
    }

    function changedObjectCount() {
      const ids = new Set();
      state.history.forEach((action) => {
        const id = action.id || action.deletedId || action.parentId;
        if (id) ids.add(id);
      });
      return ids.size;
    }

    function setCanvasZoom(value) {
      state.zoom = Math.max(10, Math.min(100, Math.round(value / 10) * 10));
      doc.documentElement.style.setProperty("--hpe-canvas-zoom", `${state.zoom}%`);
      adaptFloatingElements();
      updateStatusBar();
      updateSelectionBox();
      updatePlacementPreview();
    }

    function elementLabel(el) {
      if (el.tagName === "IMG") return "图片";
      if (el.tagName === "LI") return "列表项";
      if (el.closest("ol")) return "有序列表内容";
      if (["BUTTON", "A"].includes(el.tagName)) return "可点击文本";
      return isTextElement(el) ? "文本" : el.tagName.toLowerCase();
    }

    function applyField(name, value) {
      if (!state.selected) return;
      const el = state.selected;
      const before = el.outerHTML;
      if (["x", "y", "w", "h"].includes(name)) {
        const rect = el.getBoundingClientRect();
        const x = Number(ui.fields.x.value || rect.left + win.scrollX);
        const y = Number(ui.fields.y.value || rect.top + win.scrollY);
        const w = Number(ui.fields.w.value || rect.width);
        const h = Number(ui.fields.h.value || rect.height);
        applyRect(el, x, y, w, h);
      }
      if (name === "fontSize") el.style.fontSize = `${Number(value) || 16}px`;
      if (name === "color" && !applyInlineStyleToSavedRange({ color: value })) el.style.color = value;
      if (name === "font") el.style.fontFamily = fontStack(value);
      pushChange("属性修改", el, before, el.outerHTML);
      updateSelectionBox();
      scheduleDraft();
    }

    function applyRect(el, x, y, w, h, origin = "converted") {
      ensurePositioned(el, origin);
      applyPosition(el, x, y);
      el.style.width = `${Math.max(8, Math.round(w))}px`;
      el.style.height = `${Math.max(8, Math.round(h))}px`;
    }

    function applyPosition(el, x, y, origin = "converted") {
      ensurePositioned(el, origin);
      const parentRect = (el.offsetParent || doc.body).getBoundingClientRect();
      el.style.left = `${Math.round(x - parentRect.left - win.scrollX)}px`;
      el.style.top = `${Math.round(y - parentRect.top - win.scrollY)}px`;
    }

    function canMove(el) {
      const styles = win.getComputedStyle(el);
      return el.getAttribute(FREE) === "true" || ["absolute", "fixed"].includes(styles.position);
    }

    function ensurePositioned(el, origin = "converted") {
      const styles = win.getComputedStyle(el);
      if (["absolute", "fixed"].includes(styles.position)) {
        if (!el.getAttribute(FREE)) el.setAttribute(POSITION_ORIGIN, "original");
        return;
      }
      const parent = el.parentElement || doc.body;
      if (win.getComputedStyle(parent).position === "static") parent.style.position = "relative";
      const rect = el.getBoundingClientRect();
      const parentRect = parent.getBoundingClientRect();
      const display = styles.display;
      if (display && display !== "block") el.style.display = display;
      el.style.boxSizing = styles.boxSizing || "border-box";
      el.style.overflow = styles.overflow === "hidden" ? "visible" : styles.overflow;
      el.style.position = "absolute";
      el.style.left = `${Math.round(rect.left - parentRect.left + parent.scrollLeft)}px`;
      el.style.top = `${Math.round(rect.top - parentRect.top + parent.scrollTop)}px`;
      el.style.width = `${Math.round(rect.width)}px`;
      if (["IMG", "VIDEO", "CANVAS", "IFRAME"].includes(el.tagName)) {
        el.style.height = `${Math.round(rect.height)}px`;
      } else if (!el.style.minHeight) {
        el.style.minHeight = `${Math.round(rect.height)}px`;
      }
      el.setAttribute(FREE, "true");
      el.setAttribute(POSITION_ORIGIN, origin);
    }

    function enableFreePosition() {
      if (!state.selected) return;
      const before = state.selected.outerHTML;
      ensurePositioned(state.selected, "explicit");
      pushChange("启用自由定位", state.selected, before, state.selected.outerHTML);
      updateSelectionBox();
      updatePanel();
    }

    function startMove(event) {
      if (!state.selected) return;
      event.preventDefault();
      event.stopPropagation();
      if (!canMove(state.selected)) {
        setStatus("请先启用自由定位，再移动该元素。");
        return;
      }
      event.target.setPointerCapture?.(event.pointerId);
      const rect = state.selected.getBoundingClientRect();
      state.drag = {
        id: ensureId(state.selected),
        before: state.selected.outerHTML,
        startX: event.clientX,
        startY: event.clientY,
        x: rect.left + win.scrollX,
        y: rect.top + win.scrollY,
        w: rect.width,
        h: rect.height
      };
      doc.addEventListener("pointermove", onMove);
      doc.addEventListener("pointerup", endMove, { once: true });
      doc.addEventListener("pointercancel", endMove, { once: true });
    }

    function togglePanel() {
      ui.root.classList.toggle("panel-collapsed");
      doc.documentElement.classList.toggle("hpe-panel-collapsed", ui.root.classList.contains("panel-collapsed"));
      adaptFloatingElements();
      updateSelectionBox();
      updatePlacementPreview();
    }

    function toggleThumbnails() {
      state.thumbCollapsed = !state.thumbCollapsed;
      hideThumbnailMenu();
      syncThumbnailCollapsedState();
      adaptFloatingElements();
      updateSelectionBox();
      updatePlacementPreview();
    }

    function syncThumbnailCollapsedState() {
      const collapsed = state.reserveWorkspace && state.slides.length > 1 && state.thumbCollapsed;
      ui.root.classList.toggle("thumbs-collapsed", collapsed);
      doc.documentElement.classList.toggle("hpe-thumbs-collapsed", collapsed);
    }

    function resetPanel() {
      ui.panel.style.left = "";
      ui.panel.style.top = "";
      ui.panel.style.right = "16px";
      ui.panel.style.bottom = "76px";
      updateSelectionBox();
    }

    function startPanelDrag(event) {
      if (event.target.closest("button")) return;
      event.preventDefault();
      const rect = ui.panel.getBoundingClientRect();
      state.panelDrag = {
        startX: event.clientX,
        startY: event.clientY,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height
      };
      doc.addEventListener("pointermove", onPanelDrag);
      doc.addEventListener("pointerup", endPanelDrag, { once: true });
    }

    function onPanelDrag(event) {
      if (!state.panelDrag) return;
      const nextLeft = Math.min(
        Math.max(8, state.panelDrag.left + event.clientX - state.panelDrag.startX),
        win.innerWidth - state.panelDrag.width - 8
      );
      const nextTop = Math.min(
        Math.max(8, state.panelDrag.top + event.clientY - state.panelDrag.startY),
        win.innerHeight - 80
      );
      ui.panel.style.left = `${Math.round(nextLeft)}px`;
      ui.panel.style.top = `${Math.round(nextTop)}px`;
      ui.panel.style.right = "auto";
      ui.panel.style.bottom = "auto";
      ui.panel.style.maxHeight = `calc(100vh - ${Math.round(nextTop + 8)}px)`;
      updateSelectionBox();
    }

    function endPanelDrag() {
      doc.removeEventListener("pointermove", onPanelDrag);
      state.panelDrag = null;
    }

    function panelOverlapsSelection(rect) {
      if (ui.root.classList.contains("panel-collapsed")) return false;
      const panel = ui.panel.getBoundingClientRect();
      return !(rect.right < panel.left || rect.left > panel.right || rect.bottom < panel.top || rect.top > panel.bottom);
    }

    function onMove(event) {
      if (!state.drag || !state.selected) return;
      const nextX = state.drag.x + event.clientX - state.drag.startX;
      const nextY = state.drag.y + event.clientY - state.drag.startY;
      applyPosition(state.selected, nextX, nextY);
      updateSelectionBox();
      updatePanel();
    }

    function endMove() {
      doc.removeEventListener("pointermove", onMove);
      doc.removeEventListener("pointercancel", endMove);
      if (state.drag && state.selected) {
        pushChange("移动", state.selected, state.drag.before, state.selected.outerHTML);
      }
      state.drag = null;
      scheduleDraft();
    }

    function startResize(event) {
      if (!state.selected) return;
      event.preventDefault();
      event.stopPropagation();
      if (!canMove(state.selected)) {
        setStatus("请先启用自由定位，再缩放该元素。");
        return;
      }
      const rect = state.selected.getBoundingClientRect();
      state.resize = {
        handle: event.target.dataset.handle,
        before: state.selected.outerHTML,
        startX: event.clientX,
        startY: event.clientY,
        x: rect.left + win.scrollX,
        y: rect.top + win.scrollY,
        w: rect.width,
        h: rect.height,
        keepRatio: state.selected.tagName === "IMG"
      };
      doc.addEventListener("pointermove", onResize);
      doc.addEventListener("pointerup", endResize, { once: true });
    }

    function onResize(event) {
      if (!state.resize || !state.selected) return;
      const dx = event.clientX - state.resize.startX;
      const dy = event.clientY - state.resize.startY;
      let { x, y, w, h } = state.resize;
      const handle = state.resize.handle;
      if (handle.includes("e")) w += dx;
      if (handle.includes("s")) h += dy;
      if (handle.includes("w")) {
        x += dx;
        w -= dx;
      }
      if (handle.includes("n")) {
        y += dy;
        h -= dy;
      }
      if (state.resize.keepRatio) {
        const ratio = state.resize.w / Math.max(1, state.resize.h);
        if (Math.abs(dx) > Math.abs(dy)) h = w / ratio;
        else w = h * ratio;
      }
      applyRect(state.selected, x, y, Math.max(8, w), Math.max(8, h));
      updateSelectionBox();
      updatePanel();
    }

    function endResize() {
      doc.removeEventListener("pointermove", onResize);
      if (state.resize && state.selected) {
        pushChange("缩放", state.selected, state.resize.before, state.selected.outerHTML);
      }
      state.resize = null;
      scheduleDraft();
    }

    function addTextBox(x, y) {
      const container = currentContainer();
      const box = doc.createElement("div");
      box.textContent = "请输入文字";
      box.style.position = "absolute";
      box.style.left = "120px";
      box.style.top = "120px";
      box.style.width = "260px";
      box.style.minHeight = "48px";
      box.style.padding = "6px 8px";
      box.style.fontSize = "28px";
      box.style.color = "#111827";
      box.style.lineHeight = "1.25";
      box.style.zIndex = "20";
      box.setAttribute(FREE, "true");
      box.setAttribute(POSITION_ORIGIN, "inserted");
      if (state.selected && isTextElement(state.selected)) {
        const styles = win.getComputedStyle(state.selected);
        box.style.fontFamily = styles.fontFamily;
        box.style.fontSize = styles.fontSize;
        box.style.color = styles.color;
        box.style.fontWeight = styles.fontWeight;
      }
      ensureId(box);
      ensureId(container);
      container.appendChild(box);
      if (Number.isFinite(x) && Number.isFinite(y)) {
        applyRect(box, x, y, 260, 56, "inserted");
      }
      state.history.push({
        type: "add",
        label: "新增文本框",
        id: box.getAttribute(ID),
        parentId: container.getAttribute(ID),
        after: box.outerHTML
      });
      state.redo = [];
      select(box);
      beginTextEdit();
      scheduleDraft();
    }

    function copySelected() {
      if (!state.selected) return;
      const clone = state.selected.cloneNode(true);
      cleanEditorAttrs(clone);
      ensureId(clone, true);
      clone.setAttribute(POSITION_ORIGIN, "inserted");
      const rect = state.selected.getBoundingClientRect();
      const parent = state.selected.parentElement;
      ensureId(parent);
      parent.insertBefore(clone, state.selected.nextSibling);
      applyRect(clone, rect.left + win.scrollX + 24, rect.top + win.scrollY + 24, rect.width, rect.height, "inserted");
      state.history.push({
        type: "add",
        label: "复制元素",
        id: clone.getAttribute(ID),
        parentId: parent.getAttribute(ID),
        after: clone.outerHTML
      });
      state.redo = [];
      select(clone);
      scheduleDraft();
    }

    function deleteSelected() {
      if (!state.selected || isProtected(state.selected)) {
        setStatus("该元素可能是页面容器，已阻止删除。");
        return;
      }
      const el = state.selected;
      const parent = el.parentElement;
      const deletedId = ensureId(el);
      ensureId(parent);
      const next = el.nextElementSibling;
      if (next) ensureId(next);
      state.history.push({
        type: "delete",
        label: "删除元素",
        deletedId,
        parentId: parent.getAttribute(ID),
        nextId: next?.getAttribute(ID) || null,
        html: el.outerHTML
      });
      el.remove();
      state.selected = null;
      updateSelectionBox();
      updatePanel();
      scheduleDraft();
    }

    function isProtected(el) {
      if (!el) return true;
      if (["HTML", "BODY"].includes(el.tagName)) return true;
      const rect = el.getBoundingClientRect();
      const area = rect.width * rect.height;
      const viewportArea = win.innerWidth * win.innerHeight;
      return area > viewportArea * 0.75 || state.slides.includes(el);
    }

    function toggleBold() {
      if (!state.selected) return;
      const before = state.selected.outerHTML;
      if (applyInlineStyleToSavedRange({ fontWeight: savedRangeIsBold() ? "400" : "700" })) {
        pushChange("局部加粗", state.selected, before, state.selected.outerHTML);
        updatePanel();
        return;
      }
      const styles = win.getComputedStyle(state.selected);
      state.selected.style.fontWeight = Number(styles.fontWeight) >= 600 ? "400" : "700";
      pushChange("加粗", state.selected, before, state.selected.outerHTML);
      updatePanel();
    }

    function setTextAlign(value) {
      if (!state.selected) return;
      const before = state.selected.outerHTML;
      state.selected.style.textAlign = value;
      pushChange("文本对齐", state.selected, before, state.selected.outerHTML);
      updatePanel();
    }

    function bringToTop() {
      if (!state.selected) return;
      const before = state.selected.outerHTML;
      state.selected.style.zIndex = String(maxZ(currentContainer()) + 10);
      if (win.getComputedStyle(state.selected).position === "static") state.selected.style.position = "relative";
      pushChange("置于顶层", state.selected, before, state.selected.outerHTML);
    }

    function sendToBottom() {
      if (!state.selected) return;
      const before = state.selected.outerHTML;
      state.selected.style.zIndex = "1";
      if (win.getComputedStyle(state.selected).position === "static") state.selected.style.position = "relative";
      pushChange("置于底层", state.selected, before, state.selected.outerHTML);
    }

    function alignSelected(type) {
      if (!state.selected) return;
      if (!canMove(state.selected)) {
        setStatus("该元素在文档流中。请先启用自由定位。");
        return;
      }
      const before = state.selected.outerHTML;
      const base = currentContainer().getBoundingClientRect();
      const rect = state.selected.getBoundingClientRect();
      let x = rect.left + win.scrollX;
      let y = rect.top + win.scrollY;
      const w = rect.width;
      const h = rect.height;
      if (type === "left") x = base.left + win.scrollX;
      if (type === "center") x = base.left + win.scrollX + (base.width - w) / 2;
      if (type === "right") x = base.right + win.scrollX - w;
      if (type === "top") y = base.top + win.scrollY;
      if (type === "middle") y = base.top + win.scrollY + (base.height - h) / 2;
      if (type === "bottom") y = base.bottom + win.scrollY - h;
      applyRect(state.selected, x, y, w, h);
      pushChange("基础对齐", state.selected, before, state.selected.outerHTML);
      updateSelectionBox();
      updatePanel();
    }

    function nudge(key, amount) {
      if (!canMove(state.selected)) return;
      const before = state.selected.outerHTML;
      const rect = state.selected.getBoundingClientRect();
      const dx = key === "ArrowLeft" ? -amount : key === "ArrowRight" ? amount : 0;
      const dy = key === "ArrowUp" ? -amount : key === "ArrowDown" ? amount : 0;
      applyRect(state.selected, rect.left + win.scrollX + dx, rect.top + win.scrollY + dy, rect.width, rect.height);
      pushChange("键盘微调", state.selected, before, state.selected.outerHTML);
      updateSelectionBox();
      updatePanel();
    }

    function moveListItem(direction) {
      const li = state.selected?.closest?.("li");
      const ol = li?.parentElement;
      if (!li || !ol || ol.tagName !== "OL") {
        setStatus("当前元素不是标准有序列表项。");
        return;
      }
      const before = ol.outerHTML;
      const sibling = direction < 0 ? li.previousElementSibling : li.nextElementSibling;
      if (!sibling) return;
      if (direction < 0) ol.insertBefore(li, sibling);
      else ol.insertBefore(sibling, li);
      ol.removeAttribute("start");
      ol.querySelectorAll("li[value]").forEach((item) => item.removeAttribute("value"));
      pushChange("列表排序", ol, before, ol.outerHTML);
      select(li);
      scheduleDraft();
    }

    function detectSlides() {
      const selectors = [
        ".reveal .slides > section",
        ".slides > section",
        ".slide",
        ".page",
        "[data-slide]",
        "section"
      ];
      let found = [];
      for (const selector of selectors) {
        found = Array.from(doc.querySelectorAll(selector)).filter((el) => !el.closest(`[${UI}]`));
        if (found.length > 1) break;
      }
      if (found.length <= 1) {
        found = Array.from(doc.body.children).filter((el) => {
          if (el.closest(`[${UI}]`) || el.hasAttribute(UI)) return false;
          const styles = win.getComputedStyle(el);
          if (["fixed", "sticky"].includes(styles.position)) return false;
          const rect = el.getBoundingClientRect();
          return rect.height > win.innerHeight * 0.55 || (rect.width > win.innerWidth * 0.55 && rect.height > win.innerHeight * 0.35);
        });
      }
      state.slides = found.length > 1 ? found : [];
      state.slides.forEach(ensureId);
      doc.documentElement.classList.toggle("hpe-has-slide-thumbs", state.reserveWorkspace && state.slides.length > 1);
      ui?.root?.classList.toggle("has-slides", state.slides.length > 1);
      syncThumbnailCollapsedState();
    }

    function updateSlideUi() {
      const select = ui.fields.slide;
      const statusSelect = ui.fields.statusSlide;
      select.innerHTML = "";
      if (statusSelect) statusSelect.innerHTML = "";
      if (!state.slides.length) {
        const option = doc.createElement("option");
        option.value = "0";
        option.textContent = getPageMode();
        select.appendChild(option);
        if (statusSelect) {
          const statusOption = option.cloneNode(true);
          statusSelect.appendChild(statusOption);
          statusSelect.disabled = true;
        }
        renderSlideThumbnails();
        updateStatusBar();
        return;
      }
      if (statusSelect) statusSelect.disabled = false;
      state.slides.forEach((slide, index) => {
        const option = doc.createElement("option");
        option.value = String(index);
        option.textContent = `第 ${index + 1} 页`;
        select.appendChild(option);
        if (statusSelect) statusSelect.appendChild(option.cloneNode(true));
      });
      renderSlideThumbnails();
      updateStatusBar();
    }

    function goToSlide(index) {
      const slide = state.slides[index];
      if (!slide) return;
      state.activeSlideIndex = index;
      state.slideScrollTarget = index;
      state.slideScrollLockUntil = nowMs() + 700;
      syncSlideSelectors(index);
      updateStatusBar();
      updateThumbnailActive();
      slide.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
    }

    function renderSlideThumbnails() {
      if (!ui.fields.thumbList) return;
      ui.fields.thumbList.innerHTML = "";
      if (state.slides.length <= 1) return;
      state.slides.forEach((slide, index) => {
        const item = doc.createElement("div");
        item.className = "hpe-thumb-item";
        item.draggable = true;
        item.dataset.index = String(index);
        item.innerHTML = `
          <button class="hpe-thumb-card" data-thumb-index="${index}" type="button" title="第 ${index + 1} 页">
            <div class="hpe-thumb-index">${index + 1}</div>
            <div class="hpe-thumb-title">${escapeHtml(thumbnailTitle(slide, index))}</div>
            <div class="hpe-thumb-lines"><span style="width:88%"></span><span style="width:70%"></span><span style="width:52%"></span></div>
          </button>
        `;
        ui.fields.thumbList.appendChild(item);
      });
      updateThumbnailActive();
    }

    function thumbnailTitle(slide, index) {
      const text = (slide.querySelector("h1,h2,h3,[class*='title' i]")?.textContent || slide.textContent || "").replace(/\s+/g, " ").trim();
      return text ? text.slice(0, 28) : `第 ${index + 1} 页`;
    }

    function updateThumbnailActive() {
      ui.fields.thumbList?.querySelectorAll(".hpe-thumb-item").forEach((item) => {
        item.classList.toggle("active", Number(item.dataset.index) === state.activeSlideIndex);
      });
    }

    function onThumbnailClick(event) {
      const thumb = event.target.closest("[data-thumb-index]");
      if (!thumb) return;
      event.preventDefault();
      hideThumbnailMenu();
      state.thumbSelectionActive = true;
      clearSelection();
      goToSlide(Number(thumb.dataset.thumbIndex));
    }

    function onThumbnailContextMenu(event) {
      const item = event.target.closest(".hpe-thumb-item");
      if (!item || state.slides.length <= 1) return;
      event.preventDefault();
      event.stopPropagation();
      const index = Number(item.dataset.index);
      state.thumbMenuIndex = index;
      state.thumbSelectionActive = true;
      clearSelection();
      goToSlide(index);
      showThumbnailMenu(event.clientX, event.clientY);
    }

    function showThumbnailMenu(x, y) {
      if (!ui.thumbMenu) return;
      ui.thumbMenu.classList.add("open");
      const width = 124;
      const height = 42;
      ui.thumbMenu.style.left = `${Math.min(x, win.innerWidth - width - 8)}px`;
      ui.thumbMenu.style.top = `${Math.min(y, win.innerHeight - height - 8)}px`;
    }

    function hideThumbnailMenu() {
      if (!ui.thumbMenu) return;
      ui.thumbMenu.classList.remove("open");
      state.thumbMenuIndex = null;
    }

    function onThumbnailDragStart(event) {
      const item = event.target.closest(".hpe-thumb-item");
      if (!item) return;
      state.thumbDragIndex = Number(item.dataset.index);
      event.dataTransfer?.setData("text/plain", item.dataset.index);
      event.dataTransfer?.setDragImage?.(item, 12, 12);
    }

    function onThumbnailDragOver(event) {
      if (event.target.closest(".hpe-thumb-item")) event.preventDefault();
    }

    function onThumbnailDrop(event) {
      const item = event.target.closest(".hpe-thumb-item");
      if (!item) return;
      event.preventDefault();
      const from = Number(event.dataTransfer?.getData("text/plain") || state.thumbDragIndex);
      const to = Number(item.dataset.index);
      reorderSlides(from, to);
      state.thumbDragIndex = null;
    }

    function reorderSlides(from, to) {
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return;
      const slide = state.slides[from];
      const target = state.slides[to];
      if (!slide || !target || !target.parentElement) return;
      const parent = target.parentElement;
      if (from < to) parent.insertBefore(slide, target.nextSibling);
      else parent.insertBefore(slide, target);
      detectSlides();
      state.activeSlideIndex = Math.max(0, Math.min(to, state.slides.length - 1));
      updateSlideUi();
      goToSlide(state.activeSlideIndex);
      log("slide_reorder", { from, to });
      scheduleDraft();
    }

    function deleteSlide(index) {
      if (state.slides.length <= 1) return;
      const slide = state.slides[index];
      const parent = slide?.parentElement;
      if (!slide || !parent) return;
      hideThumbnailMenu();
      const next = slide.nextElementSibling;
      state.history.push({
        type: "delete",
        label: "删除页面",
        parentId: ensureId(parent),
        nextId: next ? ensureId(next) : null,
        html: slide.outerHTML
      });
      state.redo = [];
      slide.remove();
      detectSlides();
      state.activeSlideIndex = Math.max(0, Math.min(index, state.slides.length - 1));
      updateSlideUi();
      if (state.slides.length) goToSlide(state.activeSlideIndex);
      else updateStatusBar();
      state.thumbSelectionActive = state.slides.length > 1;
      log("slide_delete", { index });
      scheduleDraft();
    }

    function goRelativeSlide(delta) {
      if (!state.slides.length) {
        const metrics = getScrollMetrics();
        scrollPageTo(metrics.scrollTop + delta * metrics.viewportHeight * 0.8);
        return;
      }
      const next = Math.max(0, Math.min(state.slides.length - 1, state.activeSlideIndex + delta));
      goToSlide(next);
    }

    function getScrollMetrics() {
      const root = doc.documentElement;
      const body = doc.body;
      const scrollTop = Math.max(body?.scrollTop || 0, root?.scrollTop || 0, win.scrollY || 0);
      const scrollHeight = Math.max(body?.scrollHeight || 0, root?.scrollHeight || 0);
      const viewportHeight = body?.clientHeight || root?.clientHeight || win.innerHeight;
      return {
        scrollTop,
        scrollHeight,
        viewportHeight,
        maxScroll: Math.max(0, scrollHeight - viewportHeight)
      };
    }

    function scrollPageTo(top) {
      const nextTop = Math.max(0, top);
      if (doc.body) doc.body.scrollTop = nextTop;
      if (doc.documentElement) doc.documentElement.scrollTop = nextTop;
      if (doc.body?.scrollTo) doc.body.scrollTo({ top: nextTop, behavior: "smooth" });
      if (doc.documentElement?.scrollTo) doc.documentElement.scrollTo({ top: nextTop, behavior: "smooth" });
      win.scrollTo({ top: nextTop, behavior: "smooth" });
    }

    function onEditorScroll() {
      if (state.mode !== "edit") return;
      if (state.slides.length) {
        updateActiveSlideFromScroll();
        return;
      }
      updateMinimap();
      showMinimap();
      scheduleMinimapHide();
    }

    function updateActiveSlideFromScroll() {
      if (!state.slides.length) return;
      if (nowMs() < state.slideScrollLockUntil && state.slides[state.slideScrollTarget]) {
        state.activeSlideIndex = state.slideScrollTarget;
        syncSlideSelectors(state.slideScrollTarget);
        updateThumbnailActive();
        updateStatusBar();
        return;
      }
      const metrics = getScrollMetrics();
      const viewportCenter = metrics.scrollTop + metrics.viewportHeight / 2;
      let closestIndex = state.activeSlideIndex;
      let closestDistance = Infinity;
      state.slides.forEach((slide, index) => {
        const rect = slide.getBoundingClientRect();
        const center = rect.top + metrics.scrollTop + rect.height / 2;
        const distance = Math.abs(center - viewportCenter);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestIndex = index;
        }
      });
      if (closestIndex !== state.activeSlideIndex) {
        state.activeSlideIndex = closestIndex;
        syncSlideSelectors(closestIndex);
        updateThumbnailActive();
        updateStatusBar();
      }
    }

    function nowMs() {
      return win.performance?.now?.() || Date.now();
    }

    function updateMinimap() {
      if (!ui.fields.minimapTrack || !ui.fields.minimapWindow) return;
      const metrics = getScrollMetrics();
      if (metrics.maxScroll < 24) {
        ui.minimap.classList.remove("open");
        return;
      }
      renderLongPageMinimap(metrics);
      const trackHeight = ui.fields.minimapTrack.clientHeight || 168;
      const ratio = Math.min(1, metrics.viewportHeight / Math.max(metrics.viewportHeight, metrics.scrollHeight));
      const windowHeight = Math.max(18, Math.round(trackHeight * ratio));
      const maxTop = Math.max(0, trackHeight - windowHeight);
      const top = Math.round((metrics.scrollTop / Math.max(1, metrics.maxScroll)) * maxTop);
      ui.fields.minimapWindow.style.height = `${windowHeight}px`;
      ui.fields.minimapWindow.style.top = `${top}px`;
    }

    function renderLongPageMinimap(metrics) {
      if (!ui.fields.minimapContent || !ui.fields.minimapTrack) return;
      const trackHeight = ui.fields.minimapTrack.clientHeight || 190;
      const signature = [
        Math.round(metrics.scrollHeight),
        Math.round(metrics.viewportHeight),
        doc.body?.children?.length || 0,
        state.history.length
      ].join(":");
      if (state.minimapSignature === signature && ui.fields.minimapContent.childElementCount) return;
      state.minimapSignature = signature;
      const nodes = collectMinimapNodes(metrics, trackHeight);
      ui.fields.minimapContent.innerHTML = nodes.map((node) => {
        const style = [
          `left:${node.left}px`,
          `top:${node.top}px`,
          `width:${node.width}px`,
          `height:${node.height}px`
        ].join(";");
        return `<span class="hpe-minimap-node ${node.type}" style="${style}"></span>`;
      }).join("");
    }

    function collectMinimapNodes(metrics, trackHeight) {
      const bodyRect = doc.body.getBoundingClientRect();
      const contentWidth = Math.max(doc.body.scrollWidth || 0, doc.documentElement.scrollWidth || 0, win.innerWidth, 1);
      const candidates = Array.from(doc.querySelectorAll("body > :not([data-hpe-ui]), h1,h2,h3,p,li,article,section,div,img,svg,table"));
      const nodes = [];
      const seen = new Set();
      for (const el of candidates) {
        if (nodes.length >= 80) break;
        if (!el || seen.has(el) || el.closest(`[${UI}]`) || el === doc.body) continue;
        seen.add(el);
        const rect = el.getBoundingClientRect();
        if (rect.width < 28 || rect.height < 8) continue;
        const absoluteTop = rect.top + metrics.scrollTop;
        if (absoluteTop + rect.height < 0 || absoluteTop > metrics.scrollHeight) continue;
        const type = minimapNodeType(el, rect);
        const left = clamp(Math.round(((rect.left - bodyRect.left) / contentWidth) * 104) + 5, 4, 104);
        const width = clamp(Math.round((rect.width / contentWidth) * 108), type === "title" ? 28 : 14, 112 - left);
        const top = clamp(Math.round((absoluteTop / metrics.scrollHeight) * trackHeight), 1, trackHeight - 3);
        const height = clamp(Math.round((rect.height / metrics.scrollHeight) * trackHeight), type === "title" ? 5 : 3, type === "card" || type === "image" ? 28 : 12);
        nodes.push({ type, left, top, width, height });
      }
      if (!nodes.length) {
        return [
          { type: "title", left: 10, top: 12, width: 82, height: 7 },
          { type: "text", left: 10, top: 28, width: 96, height: 4 },
          { type: "card", left: 8, top: 48, width: 102, height: 24 }
        ];
      }
      return nodes;
    }

    function minimapNodeType(el, rect) {
      if (["IMG", "SVG", "CANVAS", "VIDEO", "IFRAME"].includes(el.tagName)) return "image";
      if (/^H[1-3]$/.test(el.tagName)) return "title";
      const styles = win.getComputedStyle(el);
      const bg = styles.backgroundColor || "";
      const radius = parseFloat(styles.borderRadius) || 0;
      const hasBorder = styles.borderStyle && styles.borderStyle !== "none";
      if (rect.height > 32 && (radius > 4 || hasBorder || !/rgba?\(0,\s*0,\s*0,\s*0\)|transparent/i.test(bg))) return "card";
      return "text";
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    }

    function showMinimap() {
      if (state.slides.length) return;
      if (getScrollMetrics().maxScroll < 24) return;
      updateMinimap();
      ui.minimap.classList.add("open");
    }

    function scheduleMinimapHide() {
      clearTimeout(state.minimapTimer);
      state.minimapTimer = win.setTimeout(() => {
        if (!state.minimapHover) ui.minimap.classList.remove("open");
      }, 900);
    }

    function onMinimapClick(event) {
      if (state.slides.length) return;
      if (state.minimapDrag) return;
      const rect = ui.fields.minimapTrack.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
      const target = ratio * getScrollMetrics().maxScroll;
      scrollPageTo(target);
      showMinimap();
    }

    function onMinimapPointerDown(event) {
      if (state.slides.length || !event.target.closest(".hpe-minimap-window,.hpe-minimap-track")) return;
      event.preventDefault();
      state.minimapDrag = true;
      state.minimapHover = true;
      event.target.setPointerCapture?.(event.pointerId);
      moveMinimapTo(event.clientY);
    }

    function onMinimapPointerMove(event) {
      if (!state.minimapDrag) return;
      event.preventDefault();
      moveMinimapTo(event.clientY);
    }

    function onMinimapPointerUp() {
      if (!state.minimapDrag) return;
      state.minimapDrag = null;
      scheduleMinimapHide();
    }

    function moveMinimapTo(clientY) {
      const rect = ui.fields.minimapTrack.getBoundingClientRect();
      const metrics = getScrollMetrics();
      const viewportRatio = metrics.viewportHeight / Math.max(metrics.viewportHeight, metrics.scrollHeight);
      const windowHeight = Math.max(18, rect.height * Math.min(1, viewportRatio));
      const ratio = Math.max(0, Math.min(1, (clientY - rect.top - windowHeight / 2) / Math.max(1, rect.height - windowHeight)));
      scrollPageTo(ratio * metrics.maxScroll);
      updateMinimap();
      ui.minimap.classList.add("open");
    }

    function getPageMode() {
      return state.slides.length ? `PPT 模式，${state.slides.length} 页` : "长页面模式";
    }

    function currentContainer() {
      if (state.selected) {
        const slide = state.selected.closest(".slide,.page,[data-slide],section");
        if (slide && slide !== doc.body) return slide;
      }
      return state.slides[state.activeSlideIndex] || doc.body;
    }

    function populateFonts() {
      if (ui.fields.font.dataset.ready === "true") return;
      const pageFonts = new Set();
      Array.from(doc.querySelectorAll("body *")).slice(0, 300).forEach((el) => {
        const font = normalizeFont(win.getComputedStyle(el).fontFamily);
        if (font) pageFonts.add(font);
      });
      const entries = [
        ...Array.from(pageFonts).map((font) => [font, `页面字体 / ${font}`]),
        ...SYSTEM_FONTS
      ];
      const seen = new Set();
      entries.forEach(([value, label]) => {
        const key = value.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        const option = doc.createElement("option");
        option.value = value;
        option.textContent = label;
        ui.fields.font.appendChild(option);
      });
      ui.fields.font.dataset.ready = "true";
    }

    function pushChange(label, el, before, after) {
      if (!el || before === after) return;
      const id = ensureId(el);
      state.history.push({ type: "change", label, id, before, after });
      state.redo = [];
      log("change", { label });
      scheduleDraft();
    }

    function undo() {
      const action = state.history.pop();
      if (!action) return;
      applyHistory(action, true);
      state.redo.push(action);
      scheduleDraft();
    }

    function redo() {
      const action = state.redo.pop();
      if (!action) return;
      applyHistory(action, false);
      state.history.push(action);
      scheduleDraft();
    }

    function applyHistory(action, reverse) {
      if (action.type === "change") {
        const el = findById(action.id);
        if (!el) return;
        el.outerHTML = reverse ? action.before : action.after;
        state.selected = findById(action.id);
      }
      if (action.type === "add") {
        const el = findById(action.id);
        if (reverse) {
          el?.remove();
          state.selected = null;
        } else if (!el && action.after) {
          const parent = findById(action.parentId) || doc.body;
          parent.insertAdjacentHTML("beforeend", action.after);
          state.selected = findById(action.id);
        }
      }
      if (action.type === "delete") {
        if (reverse) {
          const parent = findById(action.parentId) || doc.body;
          const next = action.nextId ? findById(action.nextId) : null;
          if (next) next.insertAdjacentHTML("beforebegin", action.html);
          else parent.insertAdjacentHTML("beforeend", action.html);
        } else {
          const temp = htmlToElement(action.html);
          const id = temp?.getAttribute(ID);
          findById(id)?.remove();
        }
        detectSlides();
        state.activeSlideIndex = Math.max(0, Math.min(state.activeSlideIndex, state.slides.length - 1));
        updateSlideUi();
      }
      updateSelectionBox();
      updatePanel();
    }

    function scheduleDraft() {
      clearTimeout(state.saveTimer);
      state.saveTimer = setTimeout(saveDraftNow, 800);
    }

    function saveDraftNow(optionsForSave = {}) {
      try {
        if (optionsForSave.feedback) setSaveFeedback("保存中");
        const html = getCleanHtml({ preserveEditing: true });
        const payload = {
          sourceName: state.sourceName,
          savedAt: Date.now(),
          html
        };
        const saveResult = options.onDraftSave
          ? Promise.resolve(options.onDraftSave(payload))
          : saveDraftWithFallback(win, state.draftKey, payload);
        return saveResult.then(() => {
          if (optionsForSave.feedback) {
            setStatus("草稿已保存。");
            setSaveFeedback("已保存");
          }
        }).catch((error) => {
          log("draft_failed", { message: error.message });
          if (optionsForSave.feedback) {
            setStatus("草稿保存失败，请稍后重试。");
            setSaveFeedback("保存失败", true);
          }
        });
      } catch (error) {
        log("draft_failed", { message: error.message });
        if (optionsForSave.feedback) {
          setStatus("草稿保存失败，请稍后重试。");
          setSaveFeedback("保存失败", true);
        }
        return Promise.resolve();
      }
    }

    function exportHtml() {
      hideExportModal();
      const html = getCleanHtml();
      downloadText(state.exportName, html, "text/html;charset=utf-8");
      log("export", { name: state.exportName });
      setEditMode();
    }

    async function exportPdf({ currentOnly = false } = {}) {
      hideExportModal();
      const libs = getPdfLibraries();
      if (!libs) {
        setStatus("\u0050\u0044\u0046 \u751f\u6210\u7ec4\u4ef6\u672a\u52a0\u8f7d\uff0c\u8bf7\u91cd\u65b0\u52a0\u8f7d\u63d2\u4ef6\u540e\u518d\u8bd5\u3002");
        log("export_pdf_library_missing");
        return;
      }
      const sources = getPdfSources(currentOnly);
      if (!sources.length) {
        setStatus("\u672a\u627e\u5230\u53ef\u5bfc\u51fa\u7684\u9875\u9762\u3002");
        log("export_pdf_no_sources");
        return;
      }
      const wasEditMode = state.mode === "edit";
      endTextEdit();
      restoreFloatingElements();
      showPdfProgress(sources.length);
      try {
        await waitForRenderTick();
        const pageSize = getPdfPageSize(sources);
        const pdf = new libs.jsPDF({
          orientation: pageSize.width >= pageSize.height ? "landscape" : "portrait",
          unit: "px",
          format: [pageSize.width, pageSize.height],
          compress: true,
          hotfixes: ["px_scaling"]
        });
        const scale = getPdfRenderScale(sources.length);
        for (let index = 0; index < sources.length; index += 1) {
          updatePdfProgress(index, sources.length, `\u6b63\u5728\u5904\u7406\u7b2c ${index + 1} / ${sources.length} \u9875`);
          const canvas = await renderPdfSourceWithRetry(sources[index], pageSize, scale, libs.html2canvas, index, sources.length);
          const image = canvas.toDataURL("image/png");
          if (index > 0) pdf.addPage([pageSize.width, pageSize.height], pageSize.width >= pageSize.height ? "landscape" : "portrait");
          pdf.addImage(image, "PNG", 0, 0, pageSize.width, pageSize.height, undefined, "FAST");
          updatePdfProgress(index + 1, sources.length);
          await waitForRenderTick();
        }
        const pdfName = state.exportName.replace(/\.html?$/i, ".pdf") || "html-ppt-export.pdf";
        pdf.save(pdfName);
        setStatus("\u0050\u0044\u0046 \u5df2\u751f\u6210\u5e76\u5f00\u59cb\u4e0b\u8f7d\u3002");
        log("export_pdf_direct", { name: pdfName, pages: sources.length, scale });
      } catch (error) {
        setStatus("\u0050\u0044\u0046 \u751f\u6210\u5931\u8d25\uff1a" + (error.message || "\u672a\u77e5\u9519\u8bef"));
        log("export_pdf_failed", { message: error.message });
      } finally {
        hidePdfProgress();
        if (wasEditMode) adaptFloatingElements();
        updateStatusBar();
      }
    }

    function getPdfLibraries() {
      const rootWindow = window;
      const jsPDF = rootWindow.jspdf?.jsPDF || rootWindow.jsPDF;
      if (!rootWindow.html2canvas || !jsPDF) return null;
      return { html2canvas: rootWindow.html2canvas, jsPDF };
    }

    function getPdfSources(currentOnly) {
      const allSources = state.slides.length
        ? state.slides
        : Array.from(doc.body.children).filter((el) => !el.closest(`[${UI}]`));
      return currentOnly && state.slides.length
        ? [state.slides[state.activeSlideIndex] || state.slides[0]].filter(Boolean)
        : allSources.filter(Boolean);
    }

    function getPdfPageSize(sources) {
      const rect = sources[0]?.getBoundingClientRect();
      const width = Math.max(1, Math.round(rect?.width || sources[0]?.scrollWidth || 1600));
      const height = Math.max(1, Math.round(rect?.height || sources[0]?.scrollHeight || 900));
      return { width, height };
    }

    function getPdfRenderScale(pageCount) {
      if (pageCount >= 12) return 1;
      return Math.min(1.5, Math.max(1, win.devicePixelRatio || 1));
    }

    async function renderPdfSourceWithRetry(source, pageSize, scale, html2canvas, index, total) {
      let lastError = null;
      const attempts = [
        { foreignObjectRendering: true },
        { foreignObjectRendering: false }
      ];
      for (let attemptIndex = 0; attemptIndex < attempts.length; attemptIndex += 1) {
        try {
          return await renderPdfSourceToCanvas(source, pageSize, scale, html2canvas, attempts[attemptIndex]);
        } catch (error) {
          lastError = error;
          if (attemptIndex < attempts.length - 1) {
            updatePdfProgress(index, total, `\u7b2c ${index + 1} / ${total} \u9875\u5904\u7406\u4e2d\uff0c\u6b63\u5728\u91cd\u8bd5`);
            await new Promise((resolve) => win.setTimeout(resolve, 500));
          }
        }
      }
      throw lastError || new Error("PDF page render failed.");
    }

    async function renderPdfSourceToCanvas(source, pageSize, scale, html2canvas, renderOptions) {
      const restore = preparePdfSourceForCapture(source, pageSize);
      try {
        await waitForCaptureReady(source);
        return await html2canvas(source, {
          backgroundColor: getPdfBackground(source),
          scale,
          useCORS: true,
          allowTaint: false,
          logging: false,
          imageTimeout: 15000,
          foreignObjectRendering: Boolean(renderOptions?.foreignObjectRendering),
          windowWidth: pageSize.width,
          windowHeight: pageSize.height,
          scrollX: 0,
          scrollY: 0
        });
      } finally {
        restore();
      }
    }

    function preparePdfSourceForCapture(source, pageSize) {
      const records = [];
      const touch = (el) => {
        if (!el || el === doc.documentElement || el.closest?.(`[${UI}]`)) return;
        const styles = win.getComputedStyle(el);
        const needsVisible = el === source || styles.display === "none" || styles.visibility === "hidden" || styles.opacity === "0";
        if (!needsVisible) return;
        records.push({
          el,
          style: el.getAttribute("style"),
          hidden: el.hasAttribute("hidden"),
          ariaHidden: el.getAttribute("aria-hidden")
        });
        el.removeAttribute("hidden");
        el.setAttribute("aria-hidden", "false");
        if (styles.display === "none") el.style.setProperty("display", "block", "important");
        if (styles.visibility === "hidden") el.style.setProperty("visibility", "visible", "important");
        if (styles.opacity === "0") el.style.setProperty("opacity", "1", "important");
      };
      const ancestors = [];
      let parent = source;
      while (parent && parent !== doc.body) {
        ancestors.unshift(parent);
        parent = parent.parentElement;
      }
      ancestors.forEach(touch);
      const rect = source.getBoundingClientRect();
      if (rect.width < 1) source.style.setProperty("width", `${pageSize.width}px`, "important");
      if (rect.height < 1) source.style.setProperty("height", `${pageSize.height}px`, "important");
      return () => {
        records.reverse().forEach(({ el, style, hidden, ariaHidden }) => {
          if (style === null) el.removeAttribute("style");
          else el.setAttribute("style", style);
          if (hidden) el.setAttribute("hidden", "");
          else el.removeAttribute("hidden");
          if (ariaHidden === null) el.removeAttribute("aria-hidden");
          else el.setAttribute("aria-hidden", ariaHidden);
        });
      };
    }

    function getPdfBackground(source) {
      const candidates = [source, doc.body, doc.documentElement];
      for (const candidate of candidates) {
        const styles = win.getComputedStyle(candidate);
        if (styles.backgroundColor && styles.backgroundColor !== "rgba(0, 0, 0, 0)" && styles.backgroundColor !== "transparent") {
          return styles.backgroundColor;
        }
      }
      return "#ffffff";
    }

    function waitForRenderTick() {
      return new Promise((resolve) => win.setTimeout(resolve, 0));
    }

    function waitForCaptureReady(root, timeout = 1500) {
      const waits = [];
      if (doc.fonts?.status !== "loaded") {
        waits.push(Promise.race([
          Promise.resolve(doc.fonts?.ready).catch(() => null),
          new Promise((resolve) => win.setTimeout(resolve, 300))
        ]));
      }
      const images = Array.from(root.querySelectorAll("img")).filter((img) => !img.complete);
      if (images.length) {
        const imageReady = Promise.all(images.map((img) => new Promise((resolve) => {
          img.addEventListener("load", resolve, { once: true });
          img.addEventListener("error", resolve, { once: true });
        })));
        waits.push(Promise.race([imageReady, new Promise((resolve) => win.setTimeout(resolve, timeout))]));
      }
      return Promise.all(waits);
    }

    function showPdfProgress(total) {
      ui.pdfProgressBackdrop.classList.add("open");
      updatePdfProgress(0, total, "\u6b63\u5728\u51c6\u5907\u751f\u6210 PDF...");
    }

    function updatePdfProgress(done, total, message) {
      if (message && ui.fields.pdfProgressText) ui.fields.pdfProgressText.textContent = message;
      const percent = total ? Math.round((done / total) * 100) : 0;
      if (ui.fields.pdfProgressBar) ui.fields.pdfProgressBar.style.width = `${Math.max(3, percent)}%`;
    }

    function hidePdfProgress() {
      ui.pdfProgressBackdrop.classList.remove("open");
      updatePdfProgress(0, 1, "\u51c6\u5907\u4e2d...");
    }
    function waitForPrintWindowReady(printWindow, timeout = 1000) {
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        const waitForImages = () => {
          try {
            const images = Array.from(printWindow.document?.images || []);
            const pending = images.filter((img) => !img.complete);
            if (!pending.length) return Promise.resolve();
            return Promise.all(pending.map((img) => new Promise((imageDone) => {
              img.addEventListener("load", imageDone, { once: true });
              img.addEventListener("error", imageDone, { once: true });
            })));
          } catch {
            return Promise.resolve();
          }
        };
        const check = () => {
          try {
            const readyState = printWindow.document?.readyState;
            if (readyState && !["complete", "interactive"].includes(readyState)) {
              win.setTimeout(check, 80);
              return;
            }
            Promise.resolve(printWindow.document?.fonts?.ready)
              .catch(() => null)
              .then(waitForImages)
              .then(finish);
          } catch {
            finish();
          }
        };
        printWindow.addEventListener?.("load", check, { once: true });
        win.setTimeout(check, 80);
        win.setTimeout(finish, timeout);
      });
    }

    function buildPrintHtml({ currentOnly = false } = {}) {
      const allSources = state.slides.length ? state.slides : Array.from(doc.body.children).filter((el) => !el.closest(`[${UI}]`));
      const sources = currentOnly && state.slides.length
        ? [state.slides[state.activeSlideIndex] || state.slides[0]]
        : allSources;
      const firstRect = sources[0]?.getBoundingClientRect();
      const pageWidth = state.slides.length ? Math.max(1, Math.round(firstRect?.width || 1600)) : 1122;
      const pageHeight = state.slides.length ? Math.max(1, Math.round(firstRect?.height || 900)) : 794;
      const rootClass = [];
      const slidesClass = [];
      const firstParent = sources[0]?.parentElement;
      const grandParent = firstParent?.parentElement;
      if (grandParent && grandParent !== doc.body && grandParent !== doc.documentElement && grandParent.className) rootClass.push(grandParent.className);
      if (firstParent && firstParent !== doc.body && firstParent !== doc.documentElement && firstParent.className) slidesClass.push(firstParent.className);
      rootClass.push("hpe-print-root");
      slidesClass.push("hpe-print-slides");
      const pages = sources.map((source) => {
        const rect = source.getBoundingClientRect();
        const sourceWidth = Math.max(1, Math.round(rect.width || source.scrollWidth || pageWidth));
        const sourceHeight = Math.max(1, Math.round(rect.height || source.scrollHeight || pageHeight));
        const scale = Math.min(1, pageWidth / sourceWidth, pageHeight / sourceHeight);
        const clone = source.cloneNode(true);
        cleanEditorAttrs(clone);
        clone.querySelectorAll?.(`[${FREE}], [${POSITION_ORIGIN}], [${UI}]`).forEach((el) => el.remove());
        clone.removeAttribute(FREE);
        clone.removeAttribute(POSITION_ORIGIN);
        clone.removeAttribute(UI);
        clone.classList.add("hpe-print-page");
        clone.removeAttribute("hidden");
        clone.setAttribute("aria-hidden", "false");
        clone.style.removeProperty("display");
        clone.style.removeProperty("visibility");
        clone.style.removeProperty("opacity");
        if (!clone.style.width) clone.style.width = `${sourceWidth}px`;
        if (!clone.style.minHeight && !clone.style.height) clone.style.minHeight = `${sourceHeight}px`;
        return `<section class="hpe-print-sheet" style="--hpe-source-w:${sourceWidth}px;--hpe-source-h:${sourceHeight}px;--hpe-print-scale:${scale.toFixed(5)};"><div class="hpe-print-scale">${clone.outerHTML}</div></section>`;
      }).join("\n");
      return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<base href="${escapeHtml(doc.baseURI || win.location.href)}">
<title>${escapeHtml(state.sourceName.replace(/\.html?$/i, ""))} PDF</title>
${collectPrintableHead()}
<style>
@page { size: ${pageWidth}px ${pageHeight}px; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; width: auto !important; height: auto !important; overflow: visible !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
.hpe-print-root, .hpe-print-slides { display: block !important; margin: 0 !important; padding: 0 !important; width: auto !important; height: auto !important; max-height: none !important; overflow: visible !important; transform: none !important; }
.hpe-print-sheet { align-items: center !important; break-after: page !important; display: flex !important; justify-content: center !important; overflow: hidden !important; page-break-after: always !important; position: relative !important; width: ${pageWidth}px !important; height: ${pageHeight}px !important; }
.hpe-print-sheet:last-child { break-after: auto !important; page-break-after: auto !important; }
.hpe-print-scale { flex: 0 0 auto !important; transform: scale(var(--hpe-print-scale)) !important; transform-origin: center center !important; }
.hpe-print-page { display: block !important; max-width: none !important; opacity: 1 !important; visibility: visible !important; width: var(--hpe-source-w) !important; min-height: var(--hpe-source-h) !important; }
</style>
</head>
<body>
<div class="${escapeHtml(rootClass.join(" "))}">
<div class="${escapeHtml(slidesClass.join(" "))}">
${pages}
</div>
</div>
</body>
</html>`;
    }

    function collectPrintableHead() {
      return Array.from(doc.head.children).filter((el) => {
        if (el.id === "hpe-editor-style" || el.getAttribute?.(UI) === "true") return false;
        if (el.tagName === "STYLE") return true;
        if (el.tagName === "LINK") {
          const rel = (el.getAttribute("rel") || "").toLowerCase();
          return ["stylesheet", "preload", "preconnect", "dns-prefetch"].includes(rel);
        }
        return false;
      }).map((el) => el.outerHTML).join("\n");
    }

    function showExportModal() {
      if (state.mode !== "preview") setPreviewMode();
      ui.fields.exportFile.textContent = state.exportName;
      ui.fields.exportChanges.textContent = `${changedObjectCount()} 处`;
      ui.exportBackdrop.classList.add("open");
    }

    function hideExportModal() {
      ui.exportBackdrop.classList.remove("open");
    }

    function enterFullscreen() {
      state.fullscreen = true;
      setPreviewMode();
      ui.root.classList.add("hpe-fullscreen");
      const target = doc.documentElement;
      target.requestFullscreen?.().catch?.((error) => {
        state.fullscreen = false;
        ui.root.classList.remove("hpe-fullscreen");
        log("fullscreen_failed", { message: error.message });
      });
    }

    function onFullscreenChange() {
      if (!doc.fullscreenElement && state.fullscreen) {
        state.fullscreen = false;
        ui.root.classList.remove("hpe-fullscreen");
        setEditMode();
      }
    }

    function exportDiagnostics() {
      const diagnostics = getDiagnostics();
      downloadText(
        `html-ppt-editor-diagnostics-${timestamp()}.json`,
        JSON.stringify(diagnostics, null, 2),
        "application/json;charset=utf-8"
      );
    }

    function getDiagnostics() {
      return {
        pluginVersion: "0.1.0",
        sourceName: state.sourceName,
        browser: win.navigator.userAgent,
        pageMode: getPageMode(),
        slideCount: state.slides.length,
        historyCount: state.history.length,
        selectedTag: state.selected?.tagName || null,
        logs: state.logs.slice(-80),
        exportedAt: new Date().toISOString()
      };
    }

    function getCleanHtml(options = {}) {
      if (!options.preserveEditing) endTextEdit();
      const shouldReadaptFloating = state.mode === "edit" && state.floatingRecords.length > 0;
      restoreFloatingElements();
      const clone = doc.documentElement.cloneNode(true);
      clone.classList.remove("hpe-editing-active");
      clone.querySelectorAll(`[${UI}], #hpe-editor-style`).forEach((el) => el.remove());
      clone.querySelectorAll(`[${EDITABLE}]`).forEach((el) => {
        el.removeAttribute("contenteditable");
        el.removeAttribute(EDITABLE);
      });
      if (!options.preserveEditing) stabilizeExportedPositionStyles(clone);
      clone.querySelectorAll(`[${ID}]`).forEach((el) => el.removeAttribute(ID));
      clone.querySelectorAll(`[${FREE}]`).forEach((el) => el.removeAttribute(FREE));
      clone.querySelectorAll(`[${POSITION_ORIGIN}]`).forEach((el) => el.removeAttribute(POSITION_ORIGIN));
      clone.querySelectorAll(`[${FLOATING}]`).forEach((el) => el.removeAttribute(FLOATING));
      clone.querySelectorAll("[data-hpe-selected]").forEach((el) => el.removeAttribute("data-hpe-selected"));
      clone.querySelectorAll("ol").forEach((ol) => {
        ol.removeAttribute("start");
        ol.querySelectorAll("li[value]").forEach((li) => li.removeAttribute("value"));
      });
      const doctype = doc.doctype
        ? `<!doctype ${doc.doctype.name}>`
        : "<!doctype html>";
      if (shouldReadaptFloating) win.requestAnimationFrame(adaptFloatingElements);
      return `${doctype}\n${clone.outerHTML}`;
    }

    function stabilizeExportedPositionStyles(root) {
      root.querySelectorAll(`[${FREE}]`).forEach((el) => {
        const origin = el.getAttribute(POSITION_ORIGIN) || "";
        if (!shouldCleanExportedPosition(el, origin)) return;
        ["position", "left", "top", "right", "bottom", "width", "height", "minHeight", "boxSizing", "overflow", "display"].forEach((name) => {
          el.style.removeProperty(cssPropertyName(name));
        });
        if (!el.getAttribute("style")?.trim()) el.removeAttribute("style");
      });
    }

    function shouldCleanExportedPosition(el, origin) {
      if (["inserted", "explicit", "original"].includes(origin)) return false;
      if (["IMG", "VIDEO", "CANVAS", "IFRAME"].includes(el.tagName)) return false;
      if (origin === "converted") return true;
      const styles = el.style;
      return styles.position === "absolute" && !styles.zIndex;
    }

    function cssPropertyName(name) {
      return name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);
    }

    function setPreviewMode() {
      state.mode = "preview";
      endTextEdit();
      restoreFloatingElements();
      doc.documentElement.classList.remove("hpe-editing-active");
      restorePointerDecorations();
      ui.root.classList.add("hpe-preview");
      updateStatusBar();
      updateSelectionBox();
      updatePlacementPreview();
    }

    function setEditMode() {
      state.mode = "edit";
      if (doc.fullscreenElement && state.fullscreen) {
        doc.exitFullscreen?.().catch?.((error) => log("fullscreen_exit_failed", { message: error.message }));
      }
      state.fullscreen = false;
      hideExportModal();
      doc.documentElement.classList.add("hpe-editing-active");
      hidePointerDecorations();
      adaptFloatingElements();
      ui.root.classList.remove("hpe-preview");
      ui.root.classList.remove("hpe-fullscreen");
      updateStatusBar();
      updateSelectionBox();
      updatePlacementPreview();
    }

    function hidePointerDecorations() {
      restorePointerDecorations();
      const candidates = Array.from(doc.querySelectorAll('[class*="cursor" i], [id*="cursor" i], [class*="pointer" i], [id*="pointer" i], [class*="laser" i], [id*="laser" i]'));
      candidates.forEach((el) => {
        if (el.closest(`[${UI}]`) || el === doc.body || el === doc.documentElement) return;
        const styles = win.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        const looksLikePointer =
          ["fixed", "absolute"].includes(styles.position) &&
          styles.pointerEvents === "none" &&
          rect.width <= 120 &&
          rect.height <= 120;
        if (!looksLikePointer) return;
        state.hiddenPointerNodes.push({ el, display: el.style.display });
        el.style.display = "none";
      });
    }

    function restorePointerDecorations() {
      state.hiddenPointerNodes.forEach(({ el, display }) => {
        if (el?.style) el.style.display = display;
      });
      state.hiddenPointerNodes = [];
    }

    function showWelcome() {
      const welcome = doc.createElement("div");
      welcome.className = "hpe-welcome";
      welcome.setAttribute(UI, "true");
      welcome.innerHTML = `
        <h2>快速开始</h2>
        <ol>
          <li>点击页面中的文字或元素即可编辑。</li>
          <li>拖动边框可移动位置，拖动控制点可调整大小。</li>
          <li>导出前可切到预览模式，确认翻页和动画正常。</li>
        </ol>
        <button type="button">知道了</button>
      `;
      welcome.querySelector("button").addEventListener("click", () => {
        welcome.remove();
        state.onWelcomeDismissed?.();
      });
      doc.body.appendChild(welcome);
    }

    function assignStableIds() {
      Array.from(doc.body?.querySelectorAll("*") || []).forEach((el) => {
        if (!el.closest(`[${UI}]`)) ensureId(el);
      });
    }

    function ensureId(el, force = false) {
      if (!el) return "";
      if (force || !el.getAttribute(ID)) {
        el.setAttribute(ID, `hpe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`);
      }
      return el.getAttribute(ID);
    }

    function findById(id) {
      if (!id) return null;
      return doc.querySelector(`[${ID}="${cssEscape(id)}"]`);
    }

    function cleanEditorAttrs(root) {
      root.querySelectorAll?.(`[${EDITABLE}]`).forEach((el) => {
        el.removeAttribute("contenteditable");
        el.removeAttribute(EDITABLE);
      });
      root.removeAttribute?.(EDITABLE);
      root.removeAttribute?.("contenteditable");
      root.querySelectorAll?.(`[${ID}]`).forEach((el) => el.removeAttribute(ID));
      root.removeAttribute?.(ID);
    }

    function htmlToElement(html) {
      const template = doc.createElement("template");
      template.innerHTML = html.trim();
      return template.content.firstElementChild;
    }

    function placeCaretAtEnd(el) {
      const range = doc.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const selection = win.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function maxZ(container) {
      return Array.from(container.querySelectorAll("*")).reduce((max, el) => {
        const z = Number.parseInt(win.getComputedStyle(el).zIndex, 10);
        return Number.isFinite(z) ? Math.max(max, z) : max;
      }, 10);
    }

    function normalizeFont(value) {
      return (value || "")
        .split(",")[0]
        .replace(/["']/g, "")
        .trim();
    }

    function fontStack(value) {
      if (!value) return "";
      if (value === "HarmonyOS Sans") return '"HarmonyOS Sans", "Microsoft YaHei", "PingFang SC", sans-serif';
      if (/Microsoft YaHei|PingFang|Noto|Source Han|SimSun/.test(value)) return `"${value}", sans-serif`;
      return `"${value}", sans-serif`;
    }

    function rgbToHex(value) {
      const match = value?.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (!match) return "#111827";
      return `#${[match[1], match[2], match[3]]
        .map((part) => Number(part).toString(16).padStart(2, "0"))
        .join("")}`;
    }

    function downloadText(name, text, type) {
      const blob = new Blob([text], { type });
      const url = URL.createObjectURL(blob);
      const anchor = doc.createElement("a");
      anchor.href = url;
      anchor.download = name;
      anchor.style.display = "none";
      doc.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function log(type, data = {}) {
      state.logs.push({ type, data, time: new Date().toISOString() });
      if (state.logs.length > 120) state.logs.shift();
    }

    function timestamp() {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, "0");
      return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
    }

    function escapeHtml(value) {
      return String(value).replace(/[&<>"']/g, (char) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      })[char]);
    }

    function cssEscape(value) {
      if (win.CSS?.escape) return win.CSS.escape(value);
      return String(value).replace(/"/g, '\\"');
    }
  }

  window.HtmlPptDraftStore = {
    save: (key, payload) => saveDraftWithFallback(window, key, payload),
    get: (key) => getDraftWithFallback(window, key),
    remove: (key) => removeDraftWithFallback(window, key)
  };
  window.createHtmlPptEditor = createHtmlPptEditor;
})();
