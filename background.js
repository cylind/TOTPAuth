// background.js - Service Worker

// Example: Listen for extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("TOTP Authenticator extension installed.");
    // You could set up default settings or perform first-time setup here
  } else if (details.reason === "update") {
    console.log("TOTP Authenticator extension updated.");
  }
});

// You could add other listeners here if needed, for example, for alarms
// or inter-extension messaging if the popup isn't always suitable.
// For this specific request, most logic is in popup.js and options.js.