const frame = document.getElementById("previewFrame");
const emptyState = document.getElementById("emptyState");

const PENDING_FILE_KEY = "hpe:pendingFile";

let activeFileName = "html-ppt-edited.html";
let activeEditor = null;
let activeObjectUrl = null;

function draftKey(name) {
  return `hpe:file:${name}`;
}

function editedName(name) {
  const fallback = "html-ppt-edited.html";
  if (!name) return fallback;
  const match = name.match(/^(.*?)(\.(html?|HTML?))$/);
  if (!match) return fallback;
  const ext = match[2].toLowerCase();
  return `${match[1]}-edited${ext}`;
}

function showFrame() {
  emptyState.style.display = "none";
  frame.style.display = "block";
}

async function restoreDraftIfNeeded(html, name) {
  const key = draftKey(name);
  try {
    const draft = await window.HtmlPptDraftStore.get(key);
    if (draft?.html && confirm("检测到上次未导出的编辑草稿，是否恢复？")) {
      return draft.html;
    }
  } catch {
    await window.HtmlPptDraftStore.remove(key);
    const rawDraft = localStorage.getItem(key);
    if (rawDraft) {
      try {
        const draft = JSON.parse(rawDraft);
        if (draft?.html && confirm("检测到上次未导出的编辑草稿，是否恢复？")) {
          return draft.html;
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }
  return html;
}

async function loadHtml(html, name = "html-ppt.html") {
  const restoredHtml = await restoreDraftIfNeeded(html, name);
  activeFileName = editedName(name);
  const key = draftKey(name);
  showFrame();
  if (activeObjectUrl) URL.revokeObjectURL(activeObjectUrl);
  activeObjectUrl = URL.createObjectURL(new Blob([restoredHtml], { type: "text/html" }));
  frame.src = activeObjectUrl;
  frame.addEventListener(
    "load",
    () => {
      if (activeEditor) activeEditor.destroy();
      activeEditor = window.createHtmlPptEditor(frame.contentWindow, {
        sourceName: name,
        exportName: activeFileName,
        draftKey: key,
        reserveWorkspace: true,
        onDraftSave: (payload) => window.HtmlPptDraftStore.save(key, payload),
        showWelcome: !localStorage.getItem("hpe:welcome-dismissed"),
        onWelcomeDismissed: () => localStorage.setItem("hpe:welcome-dismissed", "1")
      });
    },
    { once: true }
  );
}

async function loadSample(name) {
  const fileName = name === "long" ? "sample-long.html" : "sample-slides.html";
  const response = await fetch(chrome.runtime.getURL(fileName));
  const html = await response.text();
  await loadHtml(html, fileName);
}

async function loadPendingFile() {
  const result = await chrome.storage.local.get(PENDING_FILE_KEY);
  const pending = result[PENDING_FILE_KEY];
  await chrome.storage.local.remove(PENDING_FILE_KEY);
  if (!pending?.html || !pending?.name) return false;
  await loadHtml(pending.html, pending.name);
  return true;
}

async function boot() {
  const params = new URLSearchParams(location.search);
  if (params.get("pending") === "1") {
    const loaded = await loadPendingFile();
    if (!loaded) {
      emptyState.querySelector("p").textContent = "未找到待编辑文件，请从插件弹窗重新选择。";
    }
    return;
  }
  if (params.get("sample") === "slides") {
    await loadSample("slides");
    return;
  }
  if (params.get("sample") === "long") {
    await loadSample("long");
  }
}

boot();
