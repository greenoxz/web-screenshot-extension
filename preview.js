const stage = document.getElementById("stage");
const image = document.getElementById("previewImage");
const cropBox = document.getElementById("cropBox");
const imageInfo = document.getElementById("imageInfo");
const fitButton = document.getElementById("fitButton");
const zoomOutButton = document.getElementById("zoomOutButton");
const zoomSelect = document.getElementById("zoomSelect");
const zoomInButton = document.getElementById("zoomInButton");
const saveFormatSelect = document.getElementById("saveFormatSelect");
const cropButton = document.getElementById("cropButton");
const resetButton = document.getElementById("resetButton");
const downloadOriginalButton = document.getElementById("downloadOriginalButton");
const downloadCropButton = document.getElementById("downloadCropButton");

const MIN_CROP_SIZE = 24;
const CLICK_MOVE_TOLERANCE = 6;
const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];
const SAVE_FORMATS = {
  png: { mime: "image/png", extension: "png", quality: undefined },
  jpeg: { mime: "image/jpeg", extension: "jpg", quality: 0.92 },
  webp: { mime: "image/webp", extension: "webp", quality: 0.92 }
};

let screenshot = null;
let crop = null;
let drag = null;
let cropMode = false;
let zoomScale = 1;
let fitMode = true;
let pointerStart = null;
let openInCropMode = false;

init();

async function init() {
  const params = new URLSearchParams(location.search);
  const id = params.get("id");
  openInCropMode = params.get("crop") === "1";

  if (!id) {
    showError("Missing preview id.");
    return;
  }

  initSettings();

  const response = await chrome.runtime.sendMessage({ type: "GET_PREVIEW_IMAGE", id });

  if (!response?.ok) {
    showError(response?.error || "Cannot load preview image.");
    return;
  }

  screenshot = response;
  image.src = response.dataUrl;
}

image.addEventListener("load", () => {
  applyFitZoom();
  imageInfo.textContent = `${image.naturalWidth} x ${image.naturalHeight}px`;

  if (openInCropMode) {
    setCropMode(true);
  }
});

window.addEventListener("resize", () => {
  if (fitMode && image.complete && image.naturalWidth) {
    applyFitZoom();
  }
});

stage.addEventListener("pointerdown", (event) => {
  if (!image.complete || !image.naturalWidth) return;

  pointerStart = {
    x: event.clientX,
    y: event.clientY
  };

  if (!cropMode) return;

  const point = getImagePoint(event);
  const handle = event.target?.dataset?.handle;

  if (handle) {
    drag = { mode: "resize", handle, start: point, original: { ...crop } };
  } else if (isInsideCrop(point)) {
    drag = { mode: "move", start: point, original: { ...crop } };
  } else {
    crop = { x: point.x, y: point.y, width: 0, height: 0 };
    drag = { mode: "draw", start: point };
  }

  stage.setPointerCapture(event.pointerId);
  event.preventDefault();
});

stage.addEventListener("pointermove", (event) => {
  if (!drag) return;

  const point = getImagePoint(event);

  if (drag.mode === "draw") {
    crop = normalizeRect(drag.start.x, drag.start.y, point.x, point.y);
  }

  if (drag.mode === "move") {
    const dx = point.x - drag.start.x;
    const dy = point.y - drag.start.y;
    crop = clampRect({
      ...drag.original,
      x: drag.original.x + dx,
      y: drag.original.y + dy
    });
  }

  if (drag.mode === "resize") {
    crop = resizeCrop(drag.original, drag.handle, point);
  }

  renderCrop();
});

stage.addEventListener("pointerup", (event) => {
  if (!drag) {
    if (isPreviewClick(event)) {
      togglePreviewZoom();
    }

    pointerStart = null;
    return;
  }

  stage.releasePointerCapture(event.pointerId);
  crop = clampRect(crop);
  drag = null;
  pointerStart = null;
  renderCrop();
});

fitButton.addEventListener("click", applyFitZoom);
zoomOutButton.addEventListener("click", () => stepZoom(-1));
zoomInButton.addEventListener("click", () => stepZoom(1));

zoomSelect.addEventListener("change", () => {
  fitMode = false;
  setZoom(Number(zoomSelect.value));
});

saveFormatSelect.addEventListener("change", () => {
  saveSettings({ saveFormat: saveFormatSelect.value });
});

cropButton.addEventListener("click", () => {
  setCropMode(!cropMode);
});

resetButton.addEventListener("click", resetCrop);

downloadOriginalButton.addEventListener("click", async () => {
  const format = getSelectedFormat();
  const dataUrl = await createImage({
    x: 0,
    y: 0,
    width: image.naturalWidth,
    height: image.naturalHeight
  }, format);

  await chrome.downloads.download({
    url: dataUrl,
    filename: withExtension(screenshot.fileName, format.extension),
    saveAs: true
  });
});

downloadCropButton.addEventListener("click", async () => {
  const format = getSelectedFormat();
  const cropDataUrl = await createImage(crop, format);
  const fileName = withExtension(screenshot.fileName, format.extension, "-crop");

  await chrome.downloads.download({
    url: cropDataUrl,
    filename: fileName,
    saveAs: true
  });
});

function initSettings() {
  const { saveFormat = "png" } = getSettings("saveFormat");
  saveFormatSelect.value = SAVE_FORMATS[saveFormat] ? saveFormat : "png";
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

function applyFitZoom() {
  const toolbar = document.querySelector(".toolbar");
  const availableWidth = Math.max(240, window.innerWidth - 36);
  const availableHeight = Math.max(160, window.innerHeight - toolbar.offsetHeight - 36);
  const nextZoom = Math.min(
    availableWidth / image.naturalWidth,
    availableHeight / image.naturalHeight,
    1
  );

  fitMode = true;
  setZoom(Math.max(0.05, nextZoom));
}

function stepZoom(direction) {
  fitMode = false;

  const nearestIndex = ZOOM_LEVELS.reduce((bestIndex, level, index) => {
    const bestDistance = Math.abs(ZOOM_LEVELS[bestIndex] - zoomScale);
    const distance = Math.abs(level - zoomScale);

    return distance < bestDistance ? index : bestIndex;
  }, 0);
  const nextIndex = Math.min(Math.max(nearestIndex + direction, 0), ZOOM_LEVELS.length - 1);

  setZoom(ZOOM_LEVELS[nextIndex]);
}

function setZoom(scale) {
  zoomScale = scale;
  image.style.width = `${Math.round(image.naturalWidth * zoomScale)}px`;
  image.style.height = "auto";
  stage.classList.toggle("zoomed", !fitMode);
  updateZoomSelect();
  renderCrop();
}

function updateZoomSelect() {
  const rounded = Math.round(zoomScale * 100);
  const exact = ZOOM_LEVELS.find((level) => Math.round(level * 100) === rounded);

  if (!exact && !zoomSelect.querySelector("option[data-dynamic='true']")) {
    const option = document.createElement("option");
    option.dataset.dynamic = "true";
    zoomSelect.append(option);
  }

  if (exact) {
    zoomSelect.value = String(exact);
    return;
  }

  const dynamicOption = zoomSelect.querySelector("option[data-dynamic='true']");
  dynamicOption.value = String(zoomScale);
  dynamicOption.textContent = `${rounded}%`;
  zoomSelect.value = dynamicOption.value;
}

function resetCrop() {
  const marginX = Math.round(image.naturalWidth * 0.08);
  const marginY = Math.round(image.naturalHeight * 0.08);

  crop = {
    x: marginX,
    y: marginY,
    width: Math.max(MIN_CROP_SIZE, image.naturalWidth - marginX * 2),
    height: Math.max(MIN_CROP_SIZE, image.naturalHeight - marginY * 2)
  };

  renderCrop();
}

function setCropMode(isEnabled) {
  cropMode = isEnabled;
  cropButton.classList.toggle("primary", cropMode);
  cropButton.title = cropMode ? "Exit crop" : "Crop";
  cropButton.setAttribute("aria-label", cropMode ? "Exit crop" : "Crop");
  resetButton.disabled = !cropMode;
  downloadCropButton.disabled = !cropMode;

  if (cropMode && !crop) {
    resetCrop();
    return;
  }

  renderCrop();
}

function renderCrop() {
  stage.classList.toggle("crop-active", cropMode);

  if (!cropMode || !crop || crop.width < 1 || crop.height < 1) {
    cropBox.style.display = "none";
    return;
  }

  cropBox.style.display = "block";
  cropBox.style.left = `${crop.x * zoomScale}px`;
  cropBox.style.top = `${crop.y * zoomScale}px`;
  cropBox.style.width = `${crop.width * zoomScale}px`;
  cropBox.style.height = `${crop.height * zoomScale}px`;
}

function togglePreviewZoom() {
  if (cropMode) return;

  if (!fitMode) {
    applyFitZoom();
    return;
  }

  fitMode = false;
  applyFitWidthZoom();
}

function applyFitWidthZoom() {
  const availableWidth = Math.max(240, window.innerWidth - 36);
  const nextZoom = availableWidth / image.naturalWidth;

  setZoom(Math.max(0.05, nextZoom));
}

function isPreviewClick(event) {
  if (!pointerStart || cropMode) return false;

  return Math.abs(event.clientX - pointerStart.x) <= CLICK_MOVE_TOLERANCE &&
    Math.abs(event.clientY - pointerStart.y) <= CLICK_MOVE_TOLERANCE;
}

function resizeCrop(original, handle, point) {
  let left = original.x;
  let top = original.y;
  let right = original.x + original.width;
  let bottom = original.y + original.height;

  if (handle.includes("w")) left = point.x;
  if (handle.includes("e")) right = point.x;
  if (handle.includes("n")) top = point.y;
  if (handle.includes("s")) bottom = point.y;

  return clampRect(normalizeRect(left, top, right, bottom));
}

function normalizeRect(x1, y1, x2, y2) {
  return clampRect({
    x: Math.min(x1, x2),
    y: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  });
}

function clampRect(rect) {
  const width = Math.min(Math.max(rect.width, MIN_CROP_SIZE), image.naturalWidth);
  const height = Math.min(Math.max(rect.height, MIN_CROP_SIZE), image.naturalHeight);

  return {
    x: Math.min(Math.max(rect.x, 0), image.naturalWidth - width),
    y: Math.min(Math.max(rect.y, 0), image.naturalHeight - height),
    width,
    height
  };
}

function isInsideCrop(point) {
  return crop &&
    point.x >= crop.x &&
    point.x <= crop.x + crop.width &&
    point.y >= crop.y &&
    point.y <= crop.y + crop.height;
}

function getImagePoint(event) {
  const rect = stage.getBoundingClientRect();

  return {
    x: Math.min(Math.max((event.clientX - rect.left) / zoomScale, 0), image.naturalWidth),
    y: Math.min(Math.max((event.clientY - rect.top) / zoomScale, 0), image.naturalHeight)
  };
}

async function createImage(source, format) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = Math.round(source.width);
  canvas.height = Math.round(source.height);

  if (format.mime === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
  }

  context.drawImage(
    image,
    Math.round(source.x),
    Math.round(source.y),
    Math.round(source.width),
    Math.round(source.height),
    0,
    0,
    canvas.width,
    canvas.height
  );

  return canvas.toDataURL(format.mime, format.quality);
}

function getSelectedFormat() {
  return SAVE_FORMATS[saveFormatSelect.value] || SAVE_FORMATS.png;
}

function withExtension(fileName, extension, suffix = "") {
  const cleanName = fileName.replace(/\.[^.]+$/i, "");

  return `${cleanName}${suffix}.${extension}`;
}

function showError(message) {
  imageInfo.textContent = message;
  cropButton.disabled = true;
  downloadCropButton.disabled = true;
  downloadOriginalButton.disabled = true;
  resetButton.disabled = true;
  fitButton.disabled = true;
  zoomOutButton.disabled = true;
  zoomInButton.disabled = true;
  zoomSelect.disabled = true;
  saveFormatSelect.disabled = true;
}
