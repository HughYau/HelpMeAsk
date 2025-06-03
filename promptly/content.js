// content.js (v7 - Resizable, Bilingual, More APIs Prep)

let currentInputElement = null;
let enhanceButton = null;
let popoverElement = null;
let popoverContentElement = null; // Specific reference to the content box
let originalPromptForPopover = '';
const DEBUG_MODE = true;
let currentTheme = 'light';
let currentLanguage = 'en'; // Default UI language

// --- Localization Strings ---
const uiStrings = {
    en: {
        enhanceButtonTitle: 'Refine current Prompt (Alt+P)',
        popoverTitleDefault: 'Refinement Suggestion',
        popoverTitleLoading: 'Processing...',
        popoverTitleError: 'Operation Failed',
        statusLoading: 'Getting refinement suggestion...',
        statusErrorGeneric: 'Could not get a valid suggestion.',
        statusErrorInputNeeded: 'Please enter some text to refine!',
        statusCopied: 'Copied!',
        statusCopyFailed: 'Copy failed',
        statusRegenerating: 'Regenerating...',
        statusRegenerateFailed: 'Regeneration failed: ',
        buttonReplace: 'Replace',
        buttonRegenerate: 'Refresh',
        buttonCopy: 'Copy',
        buttonCloseTitle: 'Close',
        buttonThemeToggleLight: 'Switch to Dark Theme',
        buttonThemeToggleDark: 'Switch to Light Theme',
    },
    zh: {
        enhanceButtonTitle: '润色当前 Prompt (Alt+P)',
        popoverTitleDefault: '润色建议',
        popoverTitleLoading: '处理中...',
        popoverTitleError: '操作失败',
        statusLoading: '正在获取润色建议...',
        statusErrorGeneric: '未能获取有效的润色建议。',
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
    }
};

function getStr(key) {
    return uiStrings[currentLanguage]?.[key] || uiStrings.en[key] || key;
}

// --- Utility Functions ---
function log(...args) {
    if (DEBUG_MODE) console.log("[PromptEnhancer]", ...args);
}

function isElementVisible(elem) {
    if (!(elem instanceof Element)) return false;
    const style = window.getComputedStyle(elem);
    return style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0' &&
           (elem.offsetWidth > 0 || elem.offsetHeight > 0 || elem.getClientRects().length > 0);
}

// --- Input Element Detection ---
function findInputElement() {
    const selectors = [
        'textarea#prompt-textarea', // ChatGPT
        'div[contenteditable="true"][role="textbox"][aria-multiline="true"]',
        'div.ql-editor[aria-label="Message"]', // Gemini (old)
        'div[contenteditable="true"][aria-label*="Send a message"]', // Gemini (new)
        'div[contenteditable="true"][aria-label*="Prompt for"]',
        'div.ProseMirror[contenteditable="true"]', // Claude
        'textarea[placeholder*="Message DeepSeek"]', 'textarea[placeholder*="向 Kimi 提问"]',
        'textarea[data-testid="chat-input"]', 'textarea[aria-label*="Chat message input"]'
    ];
    for (let selector of selectors) {
        try {
            let element = document.querySelector(selector);
            if (element && isElementVisible(element)) return element;
        } catch (e) { /* ignore */ }
    }
    // Fallback for generic textareas and contenteditables
    const textareas = document.querySelectorAll('textarea');
    for (let ta of textareas) {
        if (!ta.closest('#prompt-enhancer-popover') && isElementVisible(ta) && ta.offsetHeight > 20) return ta;
    }
    const contentEditables = document.querySelectorAll('div[contenteditable="true"]');
    for (let ce of contentEditables) {
        if (!ce.closest('#prompt-enhancer-popover') && isElementVisible(ce) && ce.offsetHeight > 20 && (ce.getAttribute('role') === 'textbox' || ce.textContent.length < 2000)) return ce;
    }
    return null;
}

// --- Enhance Button ---
function createEnhanceButton(targetInputElement) {
    if (document.getElementById('prompt-enhance-button')) {
        positionEnhanceButton(targetInputElement);
        return;
    }
    enhanceButton = document.createElement('button');
    enhanceButton.id = 'prompt-enhance-button';
    enhanceButton.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L14.34 8.66L20 11L14.34 13.34L12 19L9.66 13.34L4 11L9.66 8.66L12 3z"/><line x1="20" y1="22" x2="18" y2="20"/><line x1="6" y1="4" x2="4" y2="2"/></svg>`;
    enhanceButton.title = getStr('enhanceButtonTitle');

    const parent = targetInputElement.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    if (parent) parent.appendChild(enhanceButton); else document.body.appendChild(enhanceButton);
    
    positionEnhanceButton(targetInputElement);
    applyThemeToElement(enhanceButton);

    enhanceButton.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        if (popoverElement && popoverElement.style.display === 'flex') {
            closePopover(); return;
        }
        let promptToEnhance = targetInputElement.tagName.toLowerCase() === 'textarea' ? targetInputElement.value : (targetInputElement.innerText || targetInputElement.textContent);
        if (!promptToEnhance.trim()) {
            openPopover(enhanceButton);
            showErrorInPopover(getStr('statusErrorInputNeeded'));
            setTimeout(() => { if (popoverElement && popoverElement.style.display === 'flex') closePopover(); }, 2000);
            return;
        }
        originalPromptForPopover = promptToEnhance;
        openPopover(enhanceButton);
        showLoadingInPopover(getStr('statusLoading'));
        chrome.runtime.sendMessage({ action: "enhancePrompt", prompt: originalPromptForPopover })
            .then(handleApiResponse)
            .catch(error => {
                log("Error sending/receiving message:", error);
                showErrorInPopover(`${getStr('statusErrorGeneric')} ${error.message}`);
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
    if (!parent) return;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

    const buttonSize = 24;
    let topPosition = (inputRect.bottom - parent.getBoundingClientRect().top) - buttonSize - 5;
    let leftPosition = (inputRect.right - parent.getBoundingClientRect().left) - buttonSize - 5;
    
    topPosition = Math.max(2, Math.min(topPosition, parent.offsetHeight - buttonSize - 2));
    leftPosition = Math.max(2, Math.min(leftPosition, parent.offsetWidth - buttonSize - 2));

    enhanceButton.style.position = 'absolute';
    enhanceButton.style.top = `${topPosition}px`;
    enhanceButton.style.left = `${leftPosition}px`;
    enhanceButton.style.zIndex = '9990';
}

// --- Popover, Theming, Localization, Resizing ---
function applyCurrentUiStrings() {
    if (!popoverContentElement) return;
    // Titles
    // Note: Title is set dynamically based on state (loading, error, default)
    // Buttons
    const replaceBtn = document.getElementById('prompt-enhancer-replace-btn');
    if (replaceBtn) replaceBtn.querySelector('span').textContent = getStr('buttonReplace');
    const regenBtn = document.getElementById('prompt-enhancer-regenerate-btn');
    if (regenBtn) regenBtn.querySelector('span').textContent = getStr('buttonRegenerate');
    const copyBtn = document.getElementById('prompt-enhancer-copy-btn');
    if (copyBtn) copyBtn.querySelector('span').textContent = getStr('buttonCopy');
    
    const closeBtn = document.getElementById('prompt-enhancer-close-btn');
    if(closeBtn) closeBtn.title = getStr('buttonCloseTitle');
    
    const themeToggleBtn = document.getElementById('prompt-enhancer-theme-toggle');
    if(themeToggleBtn) themeToggleBtn.title = currentTheme === 'light' ? getStr('buttonThemeToggleLight') : getStr('buttonThemeToggleDark');

    if (enhanceButton) enhanceButton.title = getStr('enhanceButtonTitle');
}

function applyTheme(theme) {
    currentTheme = theme;
    if (popoverContentElement) {
        popoverContentElement.classList.remove('prompt-enhancer-light-theme', 'prompt-enhancer-dark-theme');
        popoverContentElement.classList.add(`prompt-enhancer-${theme}-theme`);
    }
    applyThemeToElement(enhanceButton);
    applyThemeToElement(document.body); 

    const themeToggleBtn = document.getElementById('prompt-enhancer-theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = theme === 'light' ?
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>` : 
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;
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
    chrome.storage.sync.set({ enhancerTheme: newTheme });
}

function loadSettings() {
    chrome.storage.sync.get(['enhancerTheme', 'uiLanguage'], (data) => {
        currentTheme = data.enhancerTheme || 'light';
        currentLanguage = data.uiLanguage || 'en';
        applyTheme(currentTheme);
        applyCurrentUiStrings(); // Apply strings after language is loaded
        log(`Settings loaded: Theme=${currentTheme}, Language=${currentLanguage}`);
    });
}


function createPopover() {
    if (document.getElementById('prompt-enhancer-popover')) return;
    popoverElement = document.createElement('div');
    popoverElement.id = 'prompt-enhancer-popover';
    
    popoverElement.innerHTML = `
        <div id="prompt-enhancer-popover-content">
            <div id="prompt-enhancer-popover-header">
                <span id="prompt-enhancer-popover-title"></span>
                <div>
                    <button id="prompt-enhancer-theme-toggle"></button>
                    <button id="prompt-enhancer-close-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div id="prompt-enhancer-popover-body">
                <textarea id="prompt-enhancer-polished-prompt" readonly></textarea>
                <p id="prompt-enhancer-popover-status"></p>
            </div>
            <div id="prompt-enhancer-popover-actions">
                <button id="prompt-enhancer-replace-btn" class="popover-action-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    <span></span>
                </button>
                <button id="prompt-enhancer-regenerate-btn" class="popover-action-btn">
                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                    <span></span>
                </button>
                <button id="prompt-enhancer-copy-btn" class="popover-action-btn">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span></span>
                </button>
            </div>
            <div id="prompt-enhancer-resize-handle"></div>
        </div>
    `;
    document.body.appendChild(popoverElement);
    popoverContentElement = document.getElementById('prompt-enhancer-popover-content');
    
    loadSettings(); // Load theme and language, then apply strings

    // Event Listeners
    document.getElementById('prompt-enhancer-close-btn').addEventListener('click', closePopover);
    document.getElementById('prompt-enhancer-theme-toggle').addEventListener('click', toggleTheme);
    
    document.getElementById('prompt-enhancer-replace-btn').addEventListener('click', () => {
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        if (currentInputElement) {
            if (currentInputElement.tagName.toLowerCase() === 'textarea') currentInputElement.value = polishedPromptText;
            else if (currentInputElement.isContentEditable) currentInputElement.innerText = polishedPromptText;
            currentInputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            currentInputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            currentInputElement.focus();
        }
        closePopover();
    });

    document.getElementById('prompt-enhancer-regenerate-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        showLoadingInPopover(getStr('statusRegenerating'));
        chrome.runtime.sendMessage({ action: "enhancePrompt", prompt: originalPromptForPopover })
            .then(handleApiResponse)
            .catch(error => {
                log("Regeneration error:", error);
                showErrorInPopover(`${getStr('statusRegenerateFailed')} ${error.message}`);
            });
    });
    
    document.getElementById('prompt-enhancer-copy-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        navigator.clipboard.writeText(polishedPromptText).then(() => {
            const statusEl = document.getElementById('prompt-enhancer-popover-status');
            statusEl.textContent = getStr('statusCopied'); statusEl.className = 'success';
            setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 1500);
        }).catch(err => {
            log('Copy failed: ', err);
            const statusEl = document.getElementById('prompt-enhancer-popover-status');
            statusEl.textContent = getStr('statusCopyFailed'); statusEl.className = 'error';
        });
    });

    // Drag and Resize Listeners
    makeDraggable(popoverContentElement, document.getElementById('prompt-enhancer-popover-header'));
    makeResizable(popoverContentElement, document.getElementById('prompt-enhancer-resize-handle'));

    document.addEventListener('click', handleClickOutsidePopover, true);
    document.addEventListener('keydown', handleEscKey, true);
}

function handleClickOutsidePopover(event) {
    if (popoverElement && popoverElement.style.display === 'flex') {
        if (popoverContentElement && !popoverContentElement.contains(event.target) && event.target !== enhanceButton && !enhanceButton.contains(event.target)) {
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
    if (!popoverElement) createPopover(); // Creates and loads settings
    else loadSettings(); // Ensure theme/language are fresh if already created
    
    if (!popoverContentElement || !anchorButton) return;

    popoverElement.style.display = 'flex';
    
    // Initial positioning (can be overridden by stored size/pos later)
    const rect = anchorButton.getBoundingClientRect();
    let popoverWidth = popoverContentElement.offsetWidth;
    let popoverHeight = popoverContentElement.offsetHeight;

    let top = window.scrollY + rect.top - popoverHeight - 10;
    let left = window.scrollX + rect.left + (rect.width / 2) - (popoverWidth / 2);

    if (top < window.scrollY + 10) top = window.scrollY + rect.bottom + 10;
    if (left < window.scrollX + 10) left = window.scrollX + 10;
    if (left + popoverWidth > window.scrollX + window.innerWidth - 10) {
        left = window.scrollX + window.innerWidth - popoverWidth - 10;
    }
     if (top + popoverHeight > window.scrollY + window.innerHeight - 10) {
        top = window.scrollY + window.innerHeight - popoverHeight - 10;
    }
    
    popoverContentElement.style.top = `${top}px`;
    popoverContentElement.style.left = `${left}px`;

    // Apply stored dimensions if available
    chrome.storage.local.get(['popoverWidth', 'popoverHeight'], (data) => {
        if (data.popoverWidth) popoverContentElement.style.width = `${data.popoverWidth}px`;
        if (data.popoverHeight) popoverContentElement.style.height = `${data.popoverHeight}px`;
        // Re-center or re-position if needed after applying stored size
        // For simplicity, current positioning logic might suffice, or add more complex logic here
    });
    applyCurrentUiStrings(); // Ensure strings are correct on open
}

function closePopover() {
    if (popoverElement) popoverElement.style.display = 'none';
}

function showLoadingInPopover(message) {
    if (!popoverContentElement) return;
    if (popoverElement.style.display === 'none') openPopover(enhanceButton);

    document.getElementById('prompt-enhancer-popover-title').textContent = getStr('popoverTitleLoading');
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    statusEl.textContent = message; statusEl.className = '';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'none';
}

function showErrorInPopover(errorMessage) {
    if (!popoverContentElement) return;
     if (popoverElement.style.display === 'none') openPopover(enhanceButton);

    document.getElementById('prompt-enhancer-popover-title').textContent = getStr('popoverTitleError');
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    statusEl.textContent = errorMessage; statusEl.className = 'error';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'none';
}

function handleApiResponse(response) {
    if (!popoverContentElement) return;
    if (popoverElement.style.display === 'none') { log("Popover not visible for API response."); return; }

    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'block';
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    statusEl.textContent = ''; statusEl.className = '';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'flex';

    if (response && response.enhancedPrompt) {
        document.getElementById('prompt-enhancer-popover-title').textContent = getStr('popoverTitleDefault');
        document.getElementById('prompt-enhancer-polished-prompt').value = response.enhancedPrompt;
    } else if (response && response.error) {
        showErrorInPopover(response.error);
    } else {
        showErrorInPopover(getStr('statusErrorGeneric'));
    }
}

// --- Draggable Functionality ---
function makeDraggable(element, handle) {
    let offsetX, offsetY, isDragging = false;
    handle.addEventListener('mousedown', (e) => {
        isDragging = true;
        offsetX = e.clientX - element.getBoundingClientRect().left;
        offsetY = e.clientY - element.getBoundingClientRect().top;
        handle.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    function onMouseMove(e) {
        if (!isDragging) return;
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;
        // Boundary checks (optional, can be improved)
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - element.offsetHeight));
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
    }
    function onMouseUp() {
        isDragging = false;
        handle.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

// --- Resizable Functionality ---
function makeResizable(element, resizeHandle) {
    let startX, startY, startWidth, startHeight, isResizing = false;
    const minWidth = 400; // Minimum dimensions for usability
    const minHeight = 200;

    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation(); // Prevent drag from starting
        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
        document.addEventListener('mousemove', onResizeMouseMove);
        document.addEventListener('mouseup', onResizeMouseUp);
    });

    function onResizeMouseMove(e) {
        if (!isResizing) return;
        let newWidth = startWidth + (e.clientX - startX);
        let newHeight = startHeight + (e.clientY - startY);
        
        newWidth = Math.max(minWidth, newWidth);
        newHeight = Math.max(minHeight, newHeight);

        // Optional: Max width/height constraints (e.g., 90vw/80vh from CSS)
        // newWidth = Math.min(newWidth, window.innerWidth * 0.9);
        // newHeight = Math.min(newHeight, window.innerHeight * 0.8);

        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;
    }

    function onResizeMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        document.removeEventListener('mousemove', onResizeMouseMove);
        document.removeEventListener('mouseup', onResizeMouseUp);
        // Save new dimensions
        chrome.storage.local.set({
            popoverWidth: parseInt(element.style.width, 10),
            popoverHeight: parseInt(element.style.height, 10)
        });
    }
}


// --- Initialization and Observation ---
let debounceTimer;
function attemptToAttachButton() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const newInputElement = findInputElement();
        if (newInputElement) {
            if (newInputElement !== currentInputElement || !enhanceButton || !document.body.contains(enhanceButton)) {
                currentInputElement = newInputElement;
                if (enhanceButton && enhanceButton.parentNode) enhanceButton.parentNode.removeChild(enhanceButton);
                enhanceButton = null; 
                createEnhanceButton(currentInputElement);
            } else if (enhanceButton && document.body.contains(enhanceButton)) {
                positionEnhanceButton(currentInputElement);
                applyThemeToElement(enhanceButton);
            }
        } else {
            if (enhanceButton) enhanceButton.style.display = 'none';
            currentInputElement = null;
        }
    }, 300); 
}

const observer = new MutationObserver(attemptToAttachButton);

function initialSetup() {
    log("PromptEnhancer: Initial setup running.");
    createPopover(); // Creates popover, loads settings, applies strings & theme
    attemptToAttachButton();

    observer.observe(document.body, { childList: true, subtree: true, attributes: false });

    document.addEventListener('focusin', (event) => {
        if (event.target && (event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)) {
            if (isElementVisible(event.target) && event.target.offsetHeight > 20 && !event.target.closest('#prompt-enhancer-popover')) {
                setTimeout(attemptToAttachButton, 50);
            }
        }
    });
    
    window.addEventListener('resize', () => {
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
        if(popoverElement && popoverElement.style.display === 'flex' && enhanceButton) {
             const currentAnchor = document.getElementById('prompt-enhance-button');
             if (currentAnchor && isElementVisible(currentAnchor)) openPopover(currentAnchor);
             else if (currentInputElement && isElementVisible(currentInputElement)) {
                const tempButton = enhanceButton || createEnhanceButton(currentInputElement); // Recreate if needed
                if(tempButton) openPopover(tempButton);
             }
        }
    });
    window.addEventListener('scroll', () => {
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.altKey && (event.key === 'p' || event.key === 'P')) { // Alt+P or Alt+Shift+P
            event.preventDefault(); event.stopPropagation();
            if (enhanceButton && enhanceButton.style.display !== 'none') enhanceButton.click();
            else if (currentInputElement) {
                attemptToAttachButton();
                setTimeout(() => { if (enhanceButton && enhanceButton.style.display !== 'none') enhanceButton.click(); }, 100);
            }
        }
    });
    log("PromptEnhancer: Initial setup complete.");
}

// Start after DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initialSetup, 500));
} else {
    setTimeout(initialSetup, 500); // Fallback if already loaded
}
