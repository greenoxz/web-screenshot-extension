chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "STITCH_IMAGES") {
    return false;
  }

  stitchImages(message)
    .then((result) => sendResponse(result))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

async function stitchImages({ metrics, captures }) {
  const scale = metrics.devicePixelRatio || 1;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  canvas.width = Math.ceil(metrics.pageWidth * scale);
  canvas.height = Math.ceil(metrics.pageHeight * scale);

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);

  for (const capture of captures) {
    const image = await loadImage(capture.dataUrl);
    const destX = Math.round(capture.scrollX * scale);
    const destY = Math.round(capture.scrollY * scale);
    const availableWidth = Math.round((metrics.pageWidth - capture.scrollX) * scale);
    const availableHeight = Math.round((metrics.pageHeight - capture.scrollY) * scale);
    const sourceWidth = Math.min(image.naturalWidth, availableWidth);
    const sourceHeight = Math.min(image.naturalHeight, availableHeight);

    context.drawImage(
      image,
      0,
      0,
      sourceWidth,
      sourceHeight,
      destX,
      destY,
      sourceWidth,
      sourceHeight
    );
  }

  return {
    ok: true,
    dataUrl: canvas.toDataURL("image/png")
  };
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Unable to load the captured image."));
    image.src = dataUrl;
  });
}
