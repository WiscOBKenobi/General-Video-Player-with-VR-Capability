# General Video Player with VR Capability

Open `index.html` in desktop Edge or Chrome. Keep all files together, including `i18n.js`. No installation, account, server or internet connection is required.

- English is the default. Use **English / 中文** in the top-right corner to switch the entire interface. Reloading returns to English.
- For ordinary videos, keep **Normal video** selected.
- For side-by-side VR180, select **VR video**, **180°**, **Side by side (SBS)** and **Left eye** or **Right eye**.
- For 360° panoramas, select **VR video**, **360°** and the matching mono or stereo layout.
- Drag to look around in VR; scroll to zoom. Click or press Space to play/pause; double-click or press F for fullscreen; R resets the view.
- Enter a playback speed from 0.25 to 4, including decimals such as 1.05 or 1.1.
- Add or drop multiple files to the session playlist. Click an entry to play it. **Clear all** or **Stop** releases the entire playlist without deleting the original files.
- Fullscreen controls fade after about one second of inactivity while playing. Move the pointer or use the keyboard to restore them.

The player reads original files without transcoding, recompressing or modifying them. Rendering samples the image for the window size and VR view. Codec support, audio and performance depend on the browser and device.

The player does not upload videos or store playback history. Lists are kept only in page memory and cleared on reload or closing. Browser and operating-system records are outside the player's control; this is not a guarantee of system-wide trace removal.

Only equirectangular VR180 / 360° and normal flat video are supported. Fisheye, EAC, cubemaps, WebXR and transcoding are not included. Graphics acceleration is required; 4K/8K, HDR and all audio/codec combinations have not been comprehensively tested.

MIT License. See `LICENSE` and `THIRD_PARTY_NOTICES.md` for attribution and scope.
