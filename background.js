const OFFSCREEN_DOCUMENT = "offscreen.html";
const MAX_CAPTURE_STEPS = 120;
const SCROLL_SETTLE_MS = 180;
const CAPTURE_INTERVAL_MS = 650;
const CAPTURE_RETRY_MS = 1000;
const PREVIEW_TTL_MS = 15 * 60 * 1000;
const previewImages = new Map();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "CAPTURE_FULL_PAGE") {
    captureFullPage(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "CAPTURE_VISIBLE_AREA") {
    captureVisibleArea(message)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));

    return true;
  }

  if (message?.type === "GET_PREVIEW_IMAGE") {
    const preview = previewImages.get(message.id);
    sendResponse(preview ? { ok: true, ...preview } : { ok: false, error: "Preview image not found." });

    return false;
  }

  return false;
});

async function captureFullPage({ tabId, windowId, title }) {
  await ensureOffscreenDocument();

  const metrics = await runInTab(tabId, getPageMetrics);

  if (!metrics || metrics.pageWidth <= 0 || metrics.pageHeight <= 0) {
    throw new Error("Unable to read the webpage size.");
  }

  const captures = [];
  const positions = buildScrollPositions(metrics);

  if (positions.length > MAX_CAPTURE_STEPS) {
    throw new Error("This webpage is too long to capture in one pass.");
  }

  try {
    await runInTab(tabId, prepareForCapture);

    let lastCaptureAt = 0;

    for (const position of positions) {
      const viewport = await runInTab(tabId, scrollToPosition, [position.x, position.y]);
      await runInTab(tabId, setPinnedElementsVisible, [position.y === 0]);
      await delay(SCROLL_SETTLE_MS);

      const capture = await captureVisibleTabWithThrottle(windowId, lastCaptureAt);
      lastCaptureAt = capture.capturedAt;

      captures.push({
        dataUrl: capture.dataUrl,
        scrollX: viewport.scrollX,
        scrollY: viewport.scrollY,
        viewportWidth: viewport.viewportWidth,
        viewportHeight: viewport.viewportHeight
      });
    }
  } finally {
    await runInTab(tabId, restoreAfterCapture).catch(() => {});
  }

  const fileName = `${sanitizeFileName(title || "webpage")}-${timestamp()}.png`;
  const stitched = await stitchImages({ metrics, captures });

  if (!stitched?.ok || !stitched.dataUrl) {
    throw new Error(stitched?.error || "Unable to stitch the screenshot.");
  }

  return openPreview({ dataUrl: stitched.dataUrl, fileName });
}

async function captureVisibleArea({ windowId, title }) {
  const capture = await captureVisibleTabWithThrottle(windowId, 0);
  const fileName = `${sanitizeFileName(title || "webpage")}-${timestamp()}.png`;

  return openPreview({ dataUrl: capture.dataUrl, fileName, crop: true });
}

async function openPreview({ dataUrl, fileName, crop = false }) {
  const previewId = crypto.randomUUID();
  cleanupPreviewImages();

  previewImages.set(previewId, {
    dataUrl,
    fileName,
    createdAt: Date.now()
  });

  const cropParam = crop ? "&crop=1" : "";

  await chrome.tabs.create({
    url: chrome.runtime.getURL(`preview.html?id=${encodeURIComponent(previewId)}${cropParam}`)
  });

  return { fileName, previewId };
}

async function runInTab(tabId, func, args = []) {
  const [result] = await chrome.scripting.executeScript({
    target: { tabId },
    func,
    args
  });

  return result?.result;
}

async function captureVisibleTabWithThrottle(windowId, lastCaptureAt) {
  const elapsed = Date.now() - lastCaptureAt;

  if (elapsed < CAPTURE_INTERVAL_MS) {
    await delay(CAPTURE_INTERVAL_MS - elapsed);
  }

  try {
    return {
      dataUrl: await chrome.tabs.captureVisibleTab(windowId, { format: "png" }),
      capturedAt: Date.now()
    };
  } catch (error) {
    if (!String(error?.message || "").includes("MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND")) {
      throw error;
    }

    await delay(CAPTURE_RETRY_MS);

    return {
      dataUrl: await chrome.tabs.captureVisibleTab(windowId, { format: "png" }),
      capturedAt: Date.now()
    };
  }
}

function buildScrollPositions(metrics) {
  const maxX = Math.max(0, metrics.pageWidth - metrics.viewportWidth);
  const maxY = Math.max(0, metrics.pageHeight - metrics.viewportHeight);
  const stepX = Math.max(1, metrics.viewportWidth);
  const stepY = Math.max(1, metrics.viewportHeight);
  const xs = [];
  const ys = [];

  for (let x = 0; x < maxX; x += stepX) xs.push(x);
  xs.push(maxX);

  for (let y = 0; y < maxY; y += stepY) ys.push(y);
  ys.push(maxY);

  return uniqueNumbers(ys).flatMap((y) => uniqueNumbers(xs).map((x) => ({ x, y })));
}

function uniqueNumbers(values) {
  return [...new Set(values.map((value) => Math.round(value)))];
}

async function ensureOffscreenDocument() {
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ["OFFSCREEN_DOCUMENT"],
    documentUrls: [chrome.runtime.getURL(OFFSCREEN_DOCUMENT)]
  });

  if (existingContexts.length > 0) {
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT,
    reasons: ["BLOBS"],
    justification: "Stitch captured viewport images into a downloadable screenshot."
  });
}

function stitchImages(payload) {
  return chrome.runtime.sendMessage({
    type: "STITCH_IMAGES",
    ...payload
  });
}

function cleanupPreviewImages() {
  const expiresBefore = Date.now() - PREVIEW_TTL_MS;

  for (const [id, preview] of previewImages) {
    if (preview.createdAt < expiresBefore) {
      previewImages.delete(id);
    }
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeFileName(value) {
  return value
    .replace(/[\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "webpage";
}

function timestamp() {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, "0");

  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate())
  ].join("") + "-" + [
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds())
  ].join("");
}

function getPageMetrics() {
  const body = document.body;
  const documentElement = document.documentElement;

  return {
    pageWidth: Math.max(
      body?.scrollWidth || 0,
      body?.offsetWidth || 0,
      documentElement.scrollWidth,
      documentElement.offsetWidth,
      documentElement.clientWidth
    ),
    pageHeight: Math.max(
      body?.scrollHeight || 0,
      body?.offsetHeight || 0,
      documentElement.scrollHeight,
      documentElement.offsetHeight,
      documentElement.clientHeight
    ),
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    devicePixelRatio: window.devicePixelRatio || 1,
    originalScrollX: window.scrollX,
    originalScrollY: window.scrollY
  };
}

function prepareForCapture() {
  const pinnedElements = [...document.querySelectorAll("body *")]
    .filter((element) => {
      const style = window.getComputedStyle(element);

      return style.position === "fixed" || style.position === "sticky";
    })
    .map((element) => {
      const previousVisibility = element.style.visibility;

      element.dataset.fullPageScreenshotPinned = "true";
      element.dataset.fullPageScreenshotVisibility = previousVisibility;

      return element;
    });

  window.__fullPageScreenshotState = {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    htmlScrollBehavior: document.documentElement.style.scrollBehavior,
    bodyScrollBehavior: document.body?.style.scrollBehavior,
    pinnedCount: pinnedElements.length
  };

  document.documentElement.style.scrollBehavior = "auto";
  if (document.body) {
    document.body.style.scrollBehavior = "auto";
  }
}

function setPinnedElementsVisible(isVisible) {
  document
    .querySelectorAll("[data-full-page-screenshot-pinned='true']")
    .forEach((element) => {
      element.style.visibility = isVisible
        ? element.dataset.fullPageScreenshotVisibility || ""
        : "hidden";
    });
}

function scrollToPosition(x, y) {
  window.scrollTo(x, y);

  return {
    scrollX: window.scrollX,
    scrollY: window.scrollY,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight
  };
}

function restoreAfterCapture() {
  const state = window.__fullPageScreenshotState;

  if (!state) {
    return;
  }

  document.documentElement.style.scrollBehavior = state.htmlScrollBehavior;
  if (document.body) {
    document.body.style.scrollBehavior = state.bodyScrollBehavior || "";
  }

  document
    .querySelectorAll("[data-full-page-screenshot-pinned='true']")
    .forEach((element) => {
      element.style.visibility = element.dataset.fullPageScreenshotVisibility || "";
      delete element.dataset.fullPageScreenshotPinned;
      delete element.dataset.fullPageScreenshotVisibility;
    });

  window.scrollTo(state.scrollX, state.scrollY);
  delete window.__fullPageScreenshotState;
}
