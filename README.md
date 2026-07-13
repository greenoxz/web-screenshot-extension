# Full Page Screenshot Extension

A Chrome/Edge extension for capturing webpages, previewing the result, cropping if needed, and downloading as PNG, JPEG, or WebP.

## Features

- Capture the full webpage.
- Capture the visible area and open crop mode immediately.
- Preview screenshots before download.
- Crop by dragging and resizing a selection box.
- Toggle preview between fit-to-screen and fit-to-width by clicking the image.
- Download as PNG, JPEG, or WebP.

## Installation

### Chrome

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Enable Developer mode in the top-right corner.
4. Click Load unpacked.
5. Select the project folder, for example `web-screenshot-extension`.
6. Pin the extension from the Chrome toolbar if you want quick access.

### Microsoft Edge

1. Download or clone this repository.
2. Open Edge and go to `edge://extensions`.
3. Enable Developer mode.
4. Click Load unpacked.
5. Select the project folder.
6. Pin the extension from the toolbar if needed.

## Usage

1. Open the webpage you want to capture.
2. Click the Full Page Screenshot extension icon.
3. Choose one capture mode:
   - Full page: captures the entire webpage.
   - Crop area: captures the visible viewport and opens crop mode immediately.
4. Choose the save format: PNG, JPEG, or WebP.
5. In the preview page, adjust zoom if needed.
6. Click Crop to enable crop mode, then drag or resize the crop box.
7. Click Full to download the whole screenshot, or Crop to download only the selected area.

## Updating After Changes

After editing files locally:

1. Go to `chrome://extensions` or `edge://extensions`.
2. Find Full Page Screenshot.
3. Click the reload icon.
4. Open the extension again.

If Chrome keeps showing old errors, remove the extension and load the unpacked folder again.

## Project Files

- `manifest.json` defines the Manifest V3 extension.
- `popup.html`, `popup.css`, `popup-v2.js` provide the extension popup.
- `background.js` controls full-page scrolling, viewport capture, and preview creation.
- `offscreen.html`, `offscreen.js` stitch viewport captures into one full-page image.
- `preview.html`, `preview.css`, `preview.js` provide preview, zoom, crop, and download controls.
- `icons/` contains the extension icon.

## Limitations

- Browser internal pages such as `chrome://` pages cannot be captured.
- The Chrome Web Store and some protected pages cannot be captured.
- Very long pages may be rejected to avoid excessive memory usage.
- Fixed or sticky page elements can appear more than once in full-page captures if the webpage keeps them pinned while scrolling.

## Notes

This extension is designed for local unpacked installation. It is not packaged for the Chrome Web Store yet.
