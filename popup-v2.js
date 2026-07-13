let fullPageButton = null;
let cropAreaButton = null;
let saveFormatSelect = null;
let statusBox = null;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initPopup);
} else {
  initPopup();
}

window.addEventListener("error", handlePopupError);

function handlePopupError(event) {
  if (statusBox) {
    setStatus(event.message || "Unexpected popup error.", true);
  }
}

function initPopup() {
  fullPageButton = document.getElementById("fullPageButton") || document.getElementById("captureButton");
  cropAreaButton = document.getElementById("cropAreaButton");
  saveFormatSelect = document.getElementById("saveFormatSelect");
  statusBox = document.getElementById("status");

  if (!fullPageButton || !statusBox) {
    console.error("Required popup controls were not found.");
    return;
  }

  initSettings();

  fullPageButton.addEventListener("click", handleFullPageClick);
  cropAreaButton?.addEventListener("click", handleCropAreaClick);
  saveFormatSelect?.addEventListener("change", handleSaveFormatChange);
}

async function handleFullPageClick() {
  await capture("CAPTURE_FULL_PAGE", "Capturing full page...");
}

async function handleCropAreaClick() {
  await capture("CAPTURE_VISIBLE_AREA", "Capturing visible area...");
}

function handleSaveFormatChange() {
  try {
    saveSettings({ saveFormat: saveFormatSelect.value });
  } catch (error) {
    setStatus(error.message || "Unable to save settings.", true);
  }
}

function setStatus(message, isError = false) {
  statusBox.textContent = message;
  statusBox.classList.toggle("error", isError);
}

function setLoading(isLoading) {
  fullPageButton.disabled = isLoading;
  if (cropAreaButton) {
    cropAreaButton.disabled = isLoading;
  }
}

function initSettings() {
  if (!saveFormatSelect) return;

  const { saveFormat = "png" } = getSettings("saveFormat");
  saveFormatSelect.value = saveFormat;
}

function getSettings(key) {
  return {
    [key]: localStorage.getItem(key) || undefined
  };
}

function saveSettings(values) {
  for (const [key, value] of Object.entries(values)) {
    localStorage.setItem(key, value);
  }
}

async function capture(type, loadingMessage) {
  setLoading(true);
  setStatus(loadingMessage);

  try {
    if (!globalThis.chrome?.tabs || !globalThis.chrome?.runtime) {
      throw new Error("Open this popup from the installed extension.");
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    const response = await chrome.runtime.sendMessage({
      type,
      tabId: tab.id,
      windowId: tab.windowId,
      title: tab.title || "webpage"
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Unable to capture the page.");
    }

    setStatus("Preview opened.");
  } catch (error) {
    setStatus(error.message, true);
  } finally {
    setLoading(false);
  }
}
