const statusEl = document.getElementById("status");
const fileInput = document.getElementById("popupFileInput");

const PENDING_FILE_KEY = "hpe:pendingFile";

function setStatus(message) {
  statusEl.textContent = message || "";
}

function openEditor(params = "") {
  chrome.tabs.create({
    url: chrome.runtime.getURL(`editor.html${params}`)
  });
}

async function openLocalFile(file) {
  if (!file) return;
  if (!/\.(html?|HTML?)$/.test(file.name)) {
    setStatus("请选择 .html 或 .htm 文件。");
    return;
  }

  try {
    setStatus("正在读取文件...");
    const html = await file.text();
    await chrome.storage.local.set({
      [PENDING_FILE_KEY]: {
        name: file.name,
        html,
        savedAt: Date.now()
      }
    });
    openEditor("?pending=1");
    window.close();
  } catch (error) {
    setStatus(`打开失败：${error.message}`);
  } finally {
    fileInput.value = "";
  }
}

document.getElementById("openEditor").addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  openLocalFile(fileInput.files[0]);
});

document.getElementById("openSampleSlides").addEventListener("click", () => {
  openEditor("?sample=slides");
});

document.getElementById("openSampleLong").addEventListener("click", () => {
  openEditor("?sample=long");
});

document.getElementById("showDiagnosticsInfo").addEventListener("click", () => {
  setStatus("问题信息只在本地生成。进入编辑器后，可通过侧边栏导出诊断信息。");
});

document.getElementById("showHelp").addEventListener("click", () => {
  setStatus("使用流程：打开文件，点击元素编辑，预览确认后导出 HTML。");
});

document.getElementById("editCurrent").addEventListener("click", async () => {
  setStatus("正在进入当前页面编辑模式...");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    setStatus("未找到当前页面。");
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["editor-core.js"]
    });
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content-script.js"]
    });
    setStatus("已进入当前页面编辑模式。");
  } catch (error) {
    const isFile = tab.url?.startsWith("file:");
    setStatus(
      isFile
        ? "本地文件需要在插件详情中开启“允许访问文件网址”。"
        : `注入失败：${error.message}`
    );
  }
});
