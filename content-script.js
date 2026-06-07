(function () {
  if (window.__htmlPptEditorActive) return;
  window.__htmlPptEditorActive = true;

  if (/^https?:$/.test(location.protocol)) {
    setTimeout(() => {
      alert("将编辑当前页面快照，并保存为本地 HTML；不会修改线上网页。");
    }, 100);
  }

  window.createHtmlPptEditor(window, {
    sourceName: document.title || location.hostname || "current-page",
    exportName: defaultExportName(),
    draftKey: `hpe:current:${location.href}`,
    reserveWorkspace: true,
    showWelcome: !localStorage.getItem("hpe:welcome-dismissed"),
    onWelcomeDismissed: () => localStorage.setItem("hpe:welcome-dismissed", "1")
  });

  function defaultExportName() {
    const raw = document.title || location.hostname || "html-ppt";
    const safe = raw.replace(/[\\/:*?"<>|]+/g, "-").trim() || "html-ppt";
    return `${safe}-edited.html`;
  }
})();
