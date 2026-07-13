# Privacy Policy

Effective date: July 13, 2026

Full Page Screenshot Extension is designed to capture screenshots of webpages at the user's request. This privacy policy explains what data the extension handles and how it is used.

## Data Collection

This extension does not collect, sell, rent, or share personal information.

The extension does not send browsing history, webpage content, screenshots, or user files to any external server.

## Screenshot Data

Screenshots are created locally in the browser when the user clicks a capture button.

Captured images are temporarily held in the extension runtime so they can be displayed in the preview page. They are used only for previewing, cropping, and downloading the screenshot.

Screenshots are saved only when the user chooses to download them.

## Settings

The selected save format, such as PNG, JPEG, or WebP, may be stored locally in the browser using `localStorage`.

This setting stays on the user's device and is not transmitted anywhere.

## Permissions

The extension requests the following permissions:

- `activeTab`: to capture the currently active tab after the user clicks the extension.
- `tabs`: to identify the active tab and open the preview page.
- `scripting`: to measure and scroll the active webpage for full-page capture.
- `downloads`: to save screenshots selected by the user.
- `offscreen`: to stitch captured viewport images into a single full-page screenshot.

These permissions are used only to provide screenshot, preview, crop, and download functionality.

## Remote Services

The extension loads Material Symbols from Google Fonts for toolbar and button icons.

No screenshot data or webpage content is sent to Google Fonts by the extension.

## Third-Party Sharing

The extension does not share user data with third parties.

## Changes

This privacy policy may be updated if the extension behavior changes. Updates will be published in this repository.

## Contact

For questions or issues, open an issue in the GitHub repository.
