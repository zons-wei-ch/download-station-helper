Synology Download Station Helper
A lightweight, modern Chrome extension designed to monitor and manage your Synology NAS download tasks directly from your browser without opening the full DSM interface.

⭐ Key Features
Real-time Monitoring: Automatically polls task lists and displays the active download count via a badge on the toolbar icon.

Magnet Link Interception: Detects magnet: links on any webpage. Clicking them sends the task directly to your NAS.

Task Management: Start, pause, or delete tasks directly from the popup interface.

Connectivity Alerts: The extension icon changes to a red exclamation mark (!) if the connection to the NAS is lost.

One-Click Cleanup: "Purge Finished" feature to quickly remove completed tasks from your list.

Bandwidth Visualization: Real-time display of total upload and download speeds.

🛠️ Technical Architecture
This project is built using the Chrome Extension Manifest V3 standard and features a highly modular structure:

ES Modules: Utilizes modern JavaScript import/export syntax to separate logic into dsm_api.js (API communication) and util.js (formatting utilities).

Service Worker: Handles background polling, badge updates, and maintains session state.

Flexbox Layout: Precision UI control in the popup to ensure status text and speed icons remain perfectly aligned across different widths.

Synology WebAPI (v3/v6): Communicates directly with DSM, featuring robust session (SID) management and automatic re-login logic.

📂 File Structure

File Structure Plaintext: 
    ● manifest.json     # Extension manifest (MV3) 
    ● background.js     # Service Worker for polling & badge updates 
    ● dsm_api.js        # Encapsulated Synology WebAPI logic 
    ● content.js        # Content script for magnet link interception
    ● popup.html/js/css # Toolbar popup interface 
    ● util.js           # Shared utilities (Size/Speed formatting, Error codes) 
    ● icons/            # Extension icons and UI assets

📦 Installation
Download or clone this repository to your local machine.

Open Chrome and navigate to chrome://extensions/.

Enable "Developer mode" in the top right corner.

Click "Load unpacked" and select the project folder.

Click the extension icon and go to "Settings" to configure your NAS address, account, and password.

Note:

The extension automatically detects protocols based on ports (Default: 5000 for HTTP, 5001 for HTTPS).

Ensure that Download Station is installed and running on your Synology NAS.

🔧 Optimizations
Session Resilience: Includes an auto-retry mechanism that re-authenticates if the session SID expires (Error 105).

Responsive UI: Uses flex-shrink and min-width: 0 in CSS to prevent text overflow and layout breaking.

Robustness: The content.js includes a context-check to prevent "Extension context invalidated" errors after updates.

📄 License
MIT License. Feel free to fork and submit Pull Requests!
