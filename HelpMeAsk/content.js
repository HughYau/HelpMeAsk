// content.js (v10 - Added Poe and Doubao selectors)

let currentInputElement = null;
let enhanceButton = null;
let popoverElement = null;
let popoverContentElement = null;
let originalPromptForPopover = '';
const DEBUG_MODE = true; // Set to false for production
let currentTheme = 'light';
let currentLanguage = 'en'; // Default language
let currentDefaultRefinementStyle = 'balanced'; // Default refinement style

// --- UI Strings for Localization ---
const uiStrings = {
    en: {
        enhanceButtonTitle: 'Refine current Prompt (Alt+P)',
        statusDefault: 'Refinement Suggestion',
        statusLoading: 'Processing...',
        statusError: 'Operation Failed',
        statusErrorInputNeeded: 'Please enter text to refine!',
        statusCopied: 'Copied!',
        statusCopyFailed: 'Copy failed',
        statusRegenerating: 'Regenerating...',
        statusRegenerateFailed: 'Regen. failed: ',
        buttonReplace: 'Replace',
        buttonRegenerate: 'Refresh',
        buttonCopy: 'Copy',
        buttonCloseTitle: 'Close',
        buttonThemeToggleLight: 'Switch to Dark Theme',
        buttonThemeToggleDark: 'Switch to Light Theme',
        labelRefinementStyle: "Style:",
        styleBalanced: "Balanced",
        styleSubtle: "Subtle",
        styleCreative: "Creative",
        styleConcise: "Concise",
        styleProgramming: "Programming",
    },
    zh: { // 中文翻译
        enhanceButtonTitle: '润色当前 Prompt (Alt+P)',
        statusDefault: '润色建议',
        statusLoading: '处理中...',
        statusError: '操作失败',
        statusErrorInputNeeded: '请输入内容后再润色！',
        statusCopied: '已复制！',
        statusCopyFailed: '复制失败',
        statusRegenerating: '正在重新生成...',
        statusRegenerateFailed: '重新生成失败: ',
        buttonReplace: '替换',
        buttonRegenerate: '刷新',
        buttonCopy: '复制',
        buttonCloseTitle: '关闭',
        buttonThemeToggleLight: '切换到深色主题',
        buttonThemeToggleDark: '切换到浅色主题',
        labelRefinementStyle: "风格:",
        styleBalanced: "平衡",
        styleSubtle: "微调",
        styleCreative: "创意扩展",
        styleConcise: "简洁直接",
        styleProgramming: "编程专用",
    }
};

function getStr(key) {
    return uiStrings[currentLanguage]?.[key] || uiStrings.en[key] || key;
}

function log(...args) { if (DEBUG_MODE) console.log("[PromptEnhancer]", ...args); }

function isElementVisible(elem) {
    if (!(elem instanceof Element)) return false;
    const style = window.getComputedStyle(elem);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
           (elem.offsetWidth > 0 || elem.offsetHeight > 0 || elem.getClientRects().length > 0);
}

function findInputElement() {
    // Prioritized selectors for known platforms
    const selectors = [
        // Existing selectors
        'textarea#prompt-textarea', // ChatGPT
        'div[contenteditable="true"][role="textbox"][aria-multiline="true"]', // General contenteditable like Gemini
        'div.ql-editor[aria-label="Message"]', // Claude.ai (Quill editor)
        'div[contenteditable="true"][aria-label*="Send a message"]', // Generic send message box
        'div[contenteditable="true"][aria-label*="Prompt for"]', // Generic prompt box
        'div.ProseMirror[contenteditable="true"]', // Some platforms use ProseMirror
        'textarea[placeholder*="Message DeepSeek"]', // DeepSeek
        'textarea[placeholder*="向 Kimi 提问"]', // Kimi Chat
        'textarea[data-testid="chat-input"]', // Common test ID
        'textarea[aria-label*="Chat message input"]', // Generic chat input

        // --- New Selectors ---
        // Poe.com: Based on common patterns, might need inspection if this doesn't work.
        // Poe often uses textareas with dynamic classes, try a more general attribute.
        'textarea[placeholder*="Talk to"]', // Poe's placeholder often starts with "Talk to..." or similar
        'textarea[class*="ChatMessageInputView_textInput"]', // More specific if classes are stable
        'textarea[aria-label*="Chat input"]', // A common aria-label for chat inputs

        // Doubao (豆包) - www.doubao.com: This is a guess, will need inspection if not working.
        // Chinese websites might use different attributes or structures.
        'textarea[placeholder*="输入消息"]', // Common Chinese placeholder for "Enter message"
        'textarea[placeholder*="和豆包说点什么"]', // "Say something to Doubao" - more specific
        'div[contenteditable="true"][aria-label*="聊天框"]', // "Chat box" in Chinese
        'textarea#chat-input', // A common ID
        // Add more specific selectors for Doubao if the above are too generic
        // e.g., '.chat-input-textarea', 'div.input-area[contenteditable="true"]'
    ];
    for (let selector of selectors) {
        try {
            let element = document.querySelector(selector);
            if (element && isElementVisible(element)) {
                log("Found input element with selector:", selector, element);
                return element;
            }
        } catch (e) { /* ignore query selector errors for complex/invalid selectors on some pages */ }
    }
    // Fallback to more generic textareas and contenteditables
    log("No specific selector matched, trying generic fallbacks.");
    const textareas = document.querySelectorAll('textarea');
    for (let ta of textareas) {
        if (!ta.closest('#prompt-enhancer-popover') && isElementVisible(ta) && ta.offsetHeight > 20) {
             log("Found generic textarea fallback:", ta);
            return ta;
        }
    }
    const contentEditables = document.querySelectorAll('div[contenteditable="true"]');
    for (let ce of contentEditables) {
        if (!ce.closest('#prompt-enhancer-popover') && isElementVisible(ce) && ce.offsetHeight > 20 && (ce.getAttribute('role') === 'textbox' || ce.textContent.length < 2000)) {
            log("Found generic contenteditable fallback:", ce);
            return ce;
        }
    }
    log("No suitable input element found on the page.");
    return null;
}

function createEnhanceButton(targetInputElement) {
    if (document.getElementById('prompt-enhance-button')) {
        positionEnhanceButton(targetInputElement); return;
    }
    enhanceButton = document.createElement('button');
    enhanceButton.id = 'prompt-enhance-button';
    enhanceButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L14.34 8.66L20 11L14.34 13.34L12 19L9.66 13.34L4 11L9.66 8.66L12 3z"/><line x1="20" y1="22" x2="18" y2="20"/><line x1="6" y1="4" x2="4" y2="2"/></svg>`;
    enhanceButton.title = getStr('enhanceButtonTitle');

    const parent = targetInputElement.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    if (parent) parent.appendChild(enhanceButton); else document.body.appendChild(enhanceButton);
    
    positionEnhanceButton(targetInputElement);
    applyThemeToElement(enhanceButton); // Apply current theme

    enhanceButton.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        if (popoverElement && popoverElement.style.display === 'flex') {
            closePopover(); return;
        }
        let promptToEnhance = targetInputElement.tagName.toLowerCase() === 'textarea' ? targetInputElement.value : (targetInputElement.innerText || targetInputElement.textContent);
        if (!promptToEnhance.trim()) {
            openPopover(enhanceButton); // Open popover even if empty to show message
            updatePopoverStatus(getStr('statusErrorInputNeeded'), 'error');
            // Optionally auto-close after a delay if input is still empty
            setTimeout(() => { 
                if (popoverElement && popoverElement.style.display === 'flex' && !document.getElementById('prompt-enhancer-polished-prompt').value) {
                    const currentStatusEl = document.getElementById('prompt-enhancer-popover-status');
                    if(currentStatusEl && currentStatusEl.textContent === getStr('statusErrorInputNeeded')) {
                         closePopover();
                    }
                }
            }, 2500);
            return;
        }
        originalPromptForPopover = promptToEnhance; // Store the original prompt for regeneration
        openPopover(enhanceButton);
        showLoadingState(getStr('statusLoading'));

        const selectedStyle = document.getElementById('prompt-enhancer-refinement-style')?.value || currentDefaultRefinementStyle;
        
        chrome.runtime.sendMessage({ 
            action: "enhancePrompt", 
            prompt: originalPromptForPopover,
            refinementStyle: selectedStyle // Send the selected style
        })
        .then(handleApiResponse)
        .catch(error => {
            log("Error sending/receiving message:", error);
            showErrorState(`${getStr('statusError')} ${error.message || error}`);
        });
    });
}

function positionEnhanceButton(targetInputElement) {
    if (!enhanceButton || !targetInputElement || !isElementVisible(targetInputElement)) {
        if (enhanceButton) enhanceButton.style.display = 'none'; return;
    }
    enhanceButton.style.display = 'flex';
    const inputRect = targetInputElement.getBoundingClientRect();
    const parent = targetInputElement.parentNode;
    if (!parent) return; // Should not happen if appended correctly
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const buttonSize = 24; // Match CSS
    let topPosition = (inputRect.bottom - parent.getBoundingClientRect().top) - buttonSize - 5; // 5px offset from bottom-right
    let leftPosition = (inputRect.right - parent.getBoundingClientRect().left) - buttonSize - 5;
    
    // Ensure button stays within parent bounds (approximately)
    topPosition = Math.max(2, Math.min(topPosition, parent.offsetHeight - buttonSize - 2));
    leftPosition = Math.max(2, Math.min(leftPosition, parent.offsetWidth - buttonSize - 2));

    enhanceButton.style.position = 'absolute'; // Ensure it's absolute for parent relative positioning
    enhanceButton.style.top = `${topPosition}px`;
    enhanceButton.style.left = `${leftPosition}px`;
    enhanceButton.style.zIndex = '9990'; // Ensure it's above most elements
}

function applyCurrentUiStrings() {
    if (!popoverContentElement) return;
    // Buttons
    const replaceBtn = document.getElementById('prompt-enhancer-replace-btn');
    if (replaceBtn) replaceBtn.querySelector('span').textContent = getStr('buttonReplace');
    const regenBtn = document.getElementById('prompt-enhancer-regenerate-btn');
    if (regenBtn) regenBtn.querySelector('span').textContent = getStr('buttonRegenerate');
    const copyBtn = document.getElementById('prompt-enhancer-copy-btn');
    if (copyBtn) copyBtn.querySelector('span').textContent = getStr('buttonCopy');
    // Titles
    const closeBtn = document.getElementById('prompt-enhancer-close-btn');
    if(closeBtn) closeBtn.title = getStr('buttonCloseTitle');
    const themeToggleBtn = document.getElementById('prompt-enhancer-theme-toggle');
    if(themeToggleBtn) themeToggleBtn.title = currentTheme === 'light' ? getStr('buttonThemeToggleLight') : getStr('buttonThemeToggleDark');
    if (enhanceButton) enhanceButton.title = getStr('enhanceButtonTitle');
    
    // Style selector label and options
    const styleLabel = document.querySelector('#prompt-enhancer-style-selector-container label');
    if (styleLabel) styleLabel.textContent = getStr('labelRefinementStyle');
    
    const styleSelect = document.getElementById('prompt-enhancer-refinement-style');
    if (styleSelect) {
        styleSelect.querySelector('option[value="balanced"]').textContent = getStr('styleBalanced');
        styleSelect.querySelector('option[value="subtle"]').textContent = getStr('styleSubtle');
        styleSelect.querySelector('option[value="creative"]').textContent = getStr('styleCreative');
        styleSelect.querySelector('option[value="concise"]').textContent = getStr('styleConcise');
        styleSelect.querySelector('option[value="programming"]').textContent = getStr('styleProgramming');
    }
    // Status text is updated dynamically by showLoadingState, showErrorState, handleApiResponse
}

function applyTheme(theme) {
    currentTheme = theme;
    if (popoverContentElement) {
        popoverContentElement.classList.remove('prompt-enhancer-light-theme', 'prompt-enhancer-dark-theme');
        popoverContentElement.classList.add(`prompt-enhancer-${theme}-theme`);
    }
    applyThemeToElement(enhanceButton); // Theme the floating button
    applyThemeToElement(document.body); // Apply to body for global theme properties if needed by other elements

    // Update theme toggle button icon and title
    const themeToggleBtn = document.getElementById('prompt-enhancer-theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = theme === 'light' ?
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>` : // Moon for dark
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`; // Sun for light
        themeToggleBtn.title = theme === 'light' ? getStr('buttonThemeToggleLight') : getStr('buttonThemeToggleDark');
    }
}

function applyThemeToElement(element) {
    if (element) {
        element.classList.remove('prompt-enhancer-light-theme', 'prompt-enhancer-dark-theme');
        element.classList.add(`prompt-enhancer-${currentTheme}-theme`);
    }
}

function toggleTheme() {
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    applyTheme(newTheme);
    chrome.storage.sync.set({ enhancerTheme: newTheme }); // Save theme preference
}

function loadSettings() {
    chrome.storage.sync.get(['enhancerTheme', 'uiLanguage', 'defaultRefinementStyle'], (data) => {
        currentTheme = data.enhancerTheme || 'light'; // Default to light theme
        currentLanguage = data.uiLanguage || 'en';   // Default to English
        currentDefaultRefinementStyle = data.defaultRefinementStyle || 'balanced'; // Default style

        applyTheme(currentTheme);
        applyCurrentUiStrings(); // Apply loaded language strings

        // Set the refinement style dropdown in the popover to the stored default
        const styleSelect = document.getElementById('prompt-enhancer-refinement-style');
        if (styleSelect) {
            styleSelect.value = currentDefaultRefinementStyle;
        }
        log(`Settings loaded: Theme=${currentTheme}, Language=${currentLanguage}, DefaultStyle=${currentDefaultRefinementStyle}`);
    });
}

function createPopover() {
    if (document.getElementById('prompt-enhancer-popover')) return; // Already exists
    popoverElement = document.createElement('div');
    popoverElement.id = 'prompt-enhancer-popover'; // This is the full-screen overlay
    
    popoverElement.innerHTML = `
        <div id="prompt-enhancer-popover-content">
            <div id="prompt-enhancer-popover-header">
                <p id="prompt-enhancer-popover-status"></p>
                <div id="prompt-enhancer-header-actions">
                    <button id="prompt-enhancer-theme-toggle" title="Toggle Theme"></button>
                    <button id="prompt-enhancer-close-btn" title="Close Popover">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div id="prompt-enhancer-style-selector-container">
                <label for="prompt-enhancer-refinement-style" data-i18n-key="labelRefinementStyle">Style:</label>
                <select id="prompt-enhancer-refinement-style">
                    <option value="balanced" data-i18n-key="styleBalanced">Balanced</option>
                    <option value="subtle" data-i18n-key="styleSubtle">Subtle</option>
                    <option value="creative" data-i18n-key="styleCreative">Creative</option>
                    <option value="concise" data-i18n-key="styleConcise">Concise</option>
                    <option value="programming" data-i18n-key="styleProgramming">Programming</option>
                </select>
            </div>
            <div id="prompt-enhancer-popover-body">
                <textarea id="prompt-enhancer-polished-prompt" readonly placeholder="Refined prompt will appear here..."></textarea>
            </div>
            <div id="prompt-enhancer-popover-actions">
                <button id="prompt-enhancer-replace-btn" class="popover-action-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    <span>Replace</span>
                </button>
                <button id="prompt-enhancer-regenerate-btn" class="popover-action-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M1 4v6h6"></path><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
                    <span>Regenerate</span>
                </button>
                <button id="prompt-enhancer-copy-btn" class="popover-action-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>Copy</span>
                </button>
            </div>
            <div id="prompt-enhancer-resize-handle"></div>
        </div>
    `;
    document.body.appendChild(popoverElement);
    popoverContentElement = document.getElementById('prompt-enhancer-popover-content');
    
    loadSettings(); // Load theme, language, and default style

    // Event Listeners for popover elements
    document.getElementById('prompt-enhancer-close-btn').addEventListener('click', closePopover);
    document.getElementById('prompt-enhancer-theme-toggle').addEventListener('click', toggleTheme);
    
    document.getElementById('prompt-enhancer-replace-btn').addEventListener('click', () => {
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        if (currentInputElement && polishedPromptText) { // Ensure there's text to replace with
            if (currentInputElement.tagName.toLowerCase() === 'textarea') currentInputElement.value = polishedPromptText;
            else if (currentInputElement.isContentEditable) currentInputElement.innerText = polishedPromptText;
            // Dispatch input and change events to notify the host page
            currentInputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            currentInputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            currentInputElement.focus();
        }
        closePopover();
    });

    document.getElementById('prompt-enhancer-regenerate-btn').addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent click from closing popover if it bubbles up
        showLoadingState(getStr('statusRegenerating'));
        const selectedStyle = document.getElementById('prompt-enhancer-refinement-style').value || currentDefaultRefinementStyle;
        chrome.runtime.sendMessage({ 
            action: "enhancePrompt", 
            prompt: originalPromptForPopover, // Use the initially captured prompt
            refinementStyle: selectedStyle 
        })
        .then(handleApiResponse)
        .catch(error => {
            log("Regeneration error:", error);
            showErrorState(`${getStr('statusRegenerateFailed')} ${error.message || error}`);
        });
    });
    
    document.getElementById('prompt-enhancer-copy-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        if (!polishedPromptText) return; // Don't try to copy if empty

        navigator.clipboard.writeText(polishedPromptText).then(() => {
            const originalStatusText = document.getElementById('prompt-enhancer-popover-status').textContent;
            const originalStatusClass = document.getElementById('prompt-enhancer-popover-status').className;
            updatePopoverStatus(getStr('statusCopied'), 'success');
            setTimeout(() => { 
                // Restore previous status only if it wasn't the "Copied!" message itself
                if (document.getElementById('prompt-enhancer-popover-status').textContent === getStr('statusCopied')) {
                    if (originalStatusClass.includes('error') || originalStatusClass.includes('loading')) {
                         updatePopoverStatus(originalStatusText, originalStatusClass.replace('prompt-enhancer-status ', '')); // remove base class before adding specific
                    } else {
                         updatePopoverStatus(getStr('statusDefault'), ''); // Default state after copy
                    }
                }
            }, 1500);
        }).catch(err => {
            log('Copy failed: ', err);
            updatePopoverStatus(getStr('statusCopyFailed'), 'error');
        });
    });

    // Make popover draggable and resizable
    makeDraggable(popoverContentElement, document.getElementById('prompt-enhancer-popover-header'));
    makeResizable(popoverContentElement, document.getElementById('prompt-enhancer-resize-handle'));

    // Listen for clicks outside to close, and Esc key
    document.addEventListener('click', handleClickOutsidePopover, true); // Use capture phase
    document.addEventListener('keydown', handleEscKey, true); // Use capture phase
}

function handleClickOutsidePopover(event) {
    if (popoverElement && popoverElement.style.display === 'flex') {
        // Check if the click is outside the popover content AND not on the enhance button itself
        if (popoverContentElement && !popoverContentElement.contains(event.target) && 
            event.target !== enhanceButton && !enhanceButton?.contains(event.target)) {
            closePopover();
        }
    }
}
function handleEscKey(event) {
    if (event.key === 'Escape' && popoverElement && popoverElement.style.display === 'flex') {
        closePopover();
    }
}

function openPopover(anchorButton) {
    if (!popoverElement) createPopover(); // Create if it doesn't exist
    else loadSettings(); // Reload settings (theme, lang, default style) each time it opens

    if (!popoverContentElement || !anchorButton) {
        log("Popover content or anchor button not found for opening.");
        return;
    }

    popoverElement.style.display = 'flex'; // Show the overlay
    const rect = anchorButton.getBoundingClientRect(); // Position relative to the enhance button
    
    // Default dimensions (could be overridden by stored size)
    let popoverWidth = popoverContentElement.offsetWidth || 450; 
    let popoverHeight = popoverContentElement.offsetHeight || 250;

    // Attempt to position above the button, centered horizontally
    let top = window.scrollY + rect.top - popoverHeight - 10; // 10px margin
    let left = window.scrollX + rect.left + (rect.width / 2) - (popoverWidth / 2);

    // Adjust if too high or would go off-screen
    if (top < window.scrollY + 10) { // If too high (or would be cut off at top)
        top = window.scrollY + rect.bottom + 10; // Position below button
    }
    // Adjust horizontal position if off-screen
    if (left < window.scrollX + 10) left = window.scrollX + 10;
    if (left + popoverWidth > window.scrollX + window.innerWidth - 10) {
        left = window.scrollX + window.innerWidth - popoverWidth - 10;
    }
    // Adjust vertical position if off-screen below
     if (top + popoverHeight > window.scrollY + window.innerHeight - 10) {
        top = window.scrollY + window.innerHeight - popoverHeight - 10;
        // If it's still too high after trying to place below (e.g. button is at very bottom)
        // and it was originally trying to go above, re-attempt above with boundary.
        if (top < window.scrollY + rect.top - popoverHeight - 10) {
             top = Math.max(window.scrollY + 10, window.scrollY + rect.top - popoverHeight - 10);
        }
    }
    
    popoverContentElement.style.top = `${top}px`;
    popoverContentElement.style.left = `${left}px`;

    // Load and apply stored dimensions
    chrome.storage.local.get(['popoverWidth', 'popoverHeight'], (data) => {
        if (data.popoverWidth) popoverContentElement.style.width = `${data.popoverWidth}px`;
        if (data.popoverHeight) popoverContentElement.style.height = `${data.popoverHeight}px`;
    });
    applyCurrentUiStrings(); // Ensure UI strings are up-to-date
}

function closePopover() { 
    if (popoverElement) popoverElement.style.display = 'none'; 
}

function updatePopoverStatus(message, type = '') { // type can be 'loading', 'error', 'success' or empty
    if (!popoverContentElement) return;
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = 'prompt-enhancer-status'; // Base class
    if (type) statusEl.classList.add(type);
}


function showLoadingState(message) {
    if (!popoverContentElement) return;
    if (popoverElement.style.display === 'none') openPopover(enhanceButton); // Ensure popover is visible
    updatePopoverStatus(message, 'loading');
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'none';
    document.getElementById('prompt-enhancer-style-selector-container').style.display = 'none';
}

function showErrorState(errorMessage) {
    if (!popoverContentElement) return;
    if (popoverElement.style.display === 'none') openPopover(enhanceButton);
    updatePopoverStatus(errorMessage, 'error');
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'none';
    document.getElementById('prompt-enhancer-style-selector-container').style.display = 'flex'; // Show style selector even on error
}

function handleApiResponse(response) {
    if (!popoverContentElement || popoverElement.style.display === 'none') {
        log("Popover not visible for API response."); return;
    }
    // Ensure these elements are visible when a response (success or error) is handled
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'block';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'flex';
    document.getElementById('prompt-enhancer-style-selector-container').style.display = 'flex';


    if (response && response.enhancedPrompt) {
        updatePopoverStatus(getStr('statusDefault'), ''); // Default status when prompt is shown
        document.getElementById('prompt-enhancer-polished-prompt').value = response.enhancedPrompt;
    } else if (response && response.error) {
        showErrorState(response.error); 
    } else {
        showErrorState(getStr('statusError')); // Generic error if response is malformed
    }
}

// --- Draggable Functionality ---
function makeDraggable(element, handle) {
    let offsetX, offsetY, isDragging = false;
    handle.addEventListener('mousedown', (e) => {
        if (e.target.closest('button, select, input, textarea')) return; // Don't drag if clicking on interactive elements in header
        isDragging = true;
        offsetX = e.clientX - element.getBoundingClientRect().left;
        offsetY = e.clientY - element.getBoundingClientRect().top;
        handle.style.cursor = 'grabbing';
        element.style.userSelect = 'none'; 
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    function onMouseMove(e) {
        if (!isDragging) return;
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;
        // Boundary checks
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - element.offsetHeight));
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
    }
    function onMouseUp() {
        if (!isDragging) return;
        isDragging = false;
        handle.style.cursor = 'grab';
        element.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// --- Resizable Functionality ---
function makeResizable(element, resizeHandle) {
    let startX, startY, startWidth, startHeight, isResizing = false;
    const minWidth = parseInt(getComputedStyle(element).minWidth, 10) || 350;
    const minHeight = parseInt(getComputedStyle(element).minHeight, 10) || 200;

    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation(); // Prevent text selection and event bubbling
        isResizing = true;
        startX = e.clientX; startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
        element.style.userSelect = 'none'; // Prevent text selection during resize
        document.addEventListener('mousemove', onResizeMouseMove);
        document.addEventListener('mouseup', onResizeMouseUp);
    });
    function onResizeMouseMove(e) {
        if (!isResizing) return;
        let newWidth = startWidth + (e.clientX - startX);
        let newHeight = startHeight + (e.clientY - startY);
        // Enforce minimum dimensions
        newWidth = Math.max(minWidth, newWidth);
        newHeight = Math.max(minHeight, newHeight);
        // Optional: Enforce maximum dimensions (e.g., based on viewport)
        // newWidth = Math.min(newWidth, window.innerWidth - 20); 
        // newHeight = Math.min(newHeight, window.innerHeight - 20);
        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;
    }
    function onResizeMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        element.style.userSelect = '';
        document.removeEventListener('mousemove', onResizeMouseMove);
        document.removeEventListener('mouseup', onResizeMouseUp);
        // Save new dimensions to local storage
        chrome.storage.local.set({
            popoverWidth: parseInt(element.style.width, 10),
            popoverHeight: parseInt(element.style.height, 10)
        });
    }
}

// --- Initialization and Event Handling ---
let debounceTimer;
function attemptToAttachButton() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const newInputElement = findInputElement();
        if (newInputElement) {
            if (newInputElement !== currentInputElement || !enhanceButton || !document.body.contains(enhanceButton)) {
                currentInputElement = newInputElement;
                if (enhanceButton && enhanceButton.parentNode) enhanceButton.parentNode.removeChild(enhanceButton); // Clean up old button
                enhanceButton = null; // Reset to ensure it's recreated
                createEnhanceButton(currentInputElement);
            } else if (enhanceButton && document.body.contains(enhanceButton)) {
                // Button exists and is for the current element, just reposition and theme
                positionEnhanceButton(currentInputElement);
                applyThemeToElement(enhanceButton); // Re-apply theme in case body theme changed
            }
        } else { // No suitable input element found
            if (enhanceButton) enhanceButton.style.display = 'none';
            currentInputElement = null;
        }
    }, 300); // Debounce to avoid excessive checks
}

const observer = new MutationObserver(attemptToAttachButton);

function initialSetup() {
    log("PromptEnhancer: Initial setup running.");
    createPopover(); // Create popover structure once (hidden by default)
    attemptToAttachButton(); // Initial attempt to find input and attach button
    
    // Observe DOM changes to re-attach button if necessary (e.g., for SPAs)
    observer.observe(document.body, { childList: true, subtree: true, attributes: false });

    // Re-evaluate on focus if the target is a textarea or contenteditable
    document.addEventListener('focusin', (event) => {
        if (event.target && (event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)) {
            // Ensure it's a visible, sizable input and not part of our popover
            if (isElementVisible(event.target) && event.target.offsetHeight > 20 && !event.target.closest('#prompt-enhancer-popover')) {
                // Small delay to allow element to fully render if it just appeared
                setTimeout(attemptToAttachButton, 50);
            }
        }
    });
    
    // Reposition button on window resize and scroll
    window.addEventListener('resize', () => {
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
        // If popover is open, reposition it as well (relative to button or fallback)
        if(popoverElement && popoverElement.style.display === 'flex' && enhanceButton) {
             const currentAnchor = document.getElementById('prompt-enhance-button');
             if (currentAnchor && isElementVisible(currentAnchor)) openPopover(currentAnchor);
             else if (currentInputElement && isElementVisible(currentInputElement)) {
                // If enhance button became invisible but input is still there, try to recreate/position button and then popover
                const tempButton = enhanceButton || createEnhanceButton(currentInputElement); // This might be redundant if attemptToAttachButton runs
                if(tempButton) openPopover(tempButton);
             }
        }
    });
    window.addEventListener('scroll', () => { // Use capture for scroll to catch events early
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
    }, true);

    // Hotkey (Alt+P) to trigger the enhance button
    document.addEventListener('keydown', (event) => {
        if (event.altKey && (event.key === 'p' || event.key === 'P')) {
            event.preventDefault(); event.stopPropagation();
            if (enhanceButton && enhanceButton.style.display !== 'none') {
                enhanceButton.click();
            } else if (currentInputElement) { // If button not visible but input element exists
                attemptToAttachButton(); // Try to make button visible
                setTimeout(() => { // Then click it if it appeared
                    if (enhanceButton && enhanceButton.style.display !== 'none') enhanceButton.click();
                }, 100);
            }
        }
    });
    log("PromptEnhancer: Initial setup complete. Observer and listeners active.");
}

// Start setup after DOM is loaded, with a small delay to ensure page is stable
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initialSetup, 500));
} else {
    setTimeout(initialSetup, 500); // For already loaded pages or quick loads
}
