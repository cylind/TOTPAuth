// This script is injected into the active tab to fill the OTP.
// It listens for a message from the popup.

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "fillCode") {
    const code = request.code;
    let filled = false;

    // Try to find common OTP input fields. This is heuristic and might need improvement.
    const selectors = [
      'input[type="text"][name*="otp"]',
      'input[type="number"][name*="otp"]',
      'input[type="text"][name*="token"]',
      'input[type="number"][name*="token"]',
      'input[type="text"][autocomplete="one-time-code"]',
      'input[type="tel"][autocomplete="one-time-code"]',
      'input[name="code"]', // Generic
      'input[id*="otp"]',
      'input[id*="token"]',
      // Add more selectors as needed
    ];

    for (const selector of selectors) {
      const inputField = document.querySelector(selector);
      if (inputField && (inputField.offsetParent !== null) && !inputField.disabled && !inputField.readOnly) { // Check if visible and editable
        inputField.value = code;
        // Optionally, dispatch an 'input' event if the page relies on it
        inputField.dispatchEvent(new Event('input', { bubbles: true }));
        inputField.focus();
        filled = true;
        console.log('TOTP code filled into:', inputField);
        break; // Stop after first successful fill
      }
    }

    if (!filled) {
      // Fallback: Try to find any visible text/number input field if focused, or first available
      let activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' && (activeEl.type === 'text' || activeEl.type === 'number' || activeEl.type === 'tel')) && !activeEl.disabled && !activeEl.readOnly) {
          activeEl.value = code;
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
          filled = true;
      } else {
        const allInputs = document.querySelectorAll('input[type="text"], input[type="number"], input[type="tel"]');
        for (let inputField of allInputs) {
            if (inputField && (inputField.offsetParent !== null) && !inputField.disabled && !inputField.readOnly) {
                inputField.value = code;
                inputField.dispatchEvent(new Event('input', { bubbles: true }));
                // Do not focus here, as it might be the wrong field
                filled = true;
                console.log('TOTP code filled into (fallback):', inputField);
                break;
            }
        }
      }
    }

    if (filled) {
      sendResponse({ success: true });
    } else {
      sendResponse({ success: false, message: "No suitable input field found." });
      // Optionally, alert the user or provide feedback in the extension popup
      // alert("Could not find a TOTP field to fill.");
    }
  }
  return true; // Indicates you wish to send a response asynchronously (or synchronously)
});