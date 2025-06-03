// content.js (v8 - OpenRouter, No Title, UI Tweaks)

let currentInputElement = null;
let enhanceButton = null;
let popoverElement = null;
let popoverContentElement = null;
let originalPromptForPopover = '';
const DEBUG_MODE = true;
let currentTheme = 'light';
let currentLanguage = 'en';

const uiStrings = {
    en: {
        enhanceButtonTitle: 'Refine current Prompt (Alt+P)',
        statusDefault: 'Refinement Suggestion', // Used when prompt is shown
        statusLoading: 'Processing...',
        statusError: 'Operation Failed', // Generic error status
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
    },
    zh: {
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
    const selectors = [
        'textarea#prompt-textarea', 'div[contenteditable="true"][role="textbox"][aria-multiline="true"]',
        'div.ql-editor[aria-label="Message"]', 'div[contenteditable="true"][aria-label*="Send a message"]',
        'div[contenteditable="true"][aria-label*="Prompt for"]', 'div.ProseMirror[contenteditable="true"]',
        'textarea[placeholder*="Message DeepSeek"]', 'textarea[placeholder*="向 Kimi 提问"]',
        'textarea[data-testid="chat-input"]', 'textarea[aria-label*="Chat message input"]'
    ];
    for (let selector of selectors) {
        try {
            let element = document.querySelector(selector);
            if (element && isElementVisible(element)) return element;
        } catch (e) { /* ignore */ }
    }
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
    applyThemeToElement(enhanceButton);

    enhanceButton.addEventListener('click', (event) => {
        event.preventDefault(); event.stopPropagation();
        if (popoverElement && popoverElement.style.display === 'flex') {
            closePopover(); return;
        }
        let promptToEnhance = targetInputElement.tagName.toLowerCase() === 'textarea' ? targetInputElement.value : (targetInputElement.innerText || targetInputElement.textContent);
        if (!promptToEnhance.trim()) {
            openPopover(enhanceButton);
            updatePopoverStatus(getStr('statusErrorInputNeeded'), 'error');
            setTimeout(() => { if (popoverElement && popoverElement.style.display === 'flex') closePopover(); }, 2000);
            return;
        }
        originalPromptForPopover = promptToEnhance;
        openPopover(enhanceButton);
        showLoadingState(getStr('statusLoading'));
        chrome.runtime.sendMessage({ action: "enhancePrompt", prompt: originalPromptForPopover })
            .then(handleApiResponse)
            .catch(error => {
                log("Error sending/receiving message:", error);
                showErrorState(`${getStr('statusError')} ${error.message}`);
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

function applyCurrentUiStrings() {
    if (!popoverContentElement) return;
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
    // Status text is updated dynamically by showLoadingState, showErrorState, handleApiResponse
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
        applyCurrentUiStrings();
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
                <p id="prompt-enhancer-popover-status"></p> <!-- Status now acts as title area -->
                <div id="prompt-enhancer-header-actions"> <!-- Container for buttons -->
                    <button id="prompt-enhancer-theme-toggle"></button>
                    <button id="prompt-enhancer-close-btn">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div id="prompt-enhancer-popover-body">
                <textarea id="prompt-enhancer-polished-prompt" readonly></textarea>
                <!-- Status message for copy actions, etc., can be placed here or use the header one -->
            </div>
            <div id="prompt-enhancer-popover-actions">
                <button id="prompt-enhancer-replace-btn" class="popover-action-btn"><span></span></button>
                <button id="prompt-enhancer-regenerate-btn" class="popover-action-btn"><span></span></button>
                <button id="prompt-enhancer-copy-btn" class="popover-action-btn"><span></span></button>
            </div>
            <div id="prompt-enhancer-resize-handle"></div>
        </div>
    `;
    document.body.appendChild(popoverElement);
    popoverContentElement = document.getElementById('prompt-enhancer-popover-content');
    
    loadSettings(); 

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
        showLoadingState(getStr('statusRegenerating'));
        chrome.runtime.sendMessage({ action: "enhancePrompt", prompt: originalPromptForPopover })
            .then(handleApiResponse)
            .catch(error => {
                log("Regeneration error:", error);
                showErrorState(`${getStr('statusRegenerateFailed')} ${error.message}`);
            });
    });
    
    document.getElementById('prompt-enhancer-copy-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        navigator.clipboard.writeText(polishedPromptText).then(() => {
            // Use a temporary message in the status or a small toast-like notification
            const originalStatus = document.getElementById('prompt-enhancer-popover-status').textContent;
            const originalStatusClass = document.getElementById('prompt-enhancer-popover-status').className;
            updatePopoverStatus(getStr('statusCopied'), 'success');
            setTimeout(() => { 
                // Restore previous status if it was an error or loading, or set to default
                if (originalStatusClass.includes('error') || originalStatusClass.includes('loading')) {
                     updatePopoverStatus(originalStatus, originalStatusClass);
                } else {
                     updatePopoverStatus(getStr('statusDefault'), ''); // Default state after copy
                }
            }, 1500);
        }).catch(err => {
            log('Copy failed: ', err);
            updatePopoverStatus(getStr('statusCopyFailed'), 'error');
        });
    });

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
    if (event.key === 'Escape' && popoverElement && popoverElement.style.display === 'flex') closePopover();
}

function openPopover(anchorButton) {
    if (!popoverElement) createPopover(); else loadSettings();
    if (!popoverContentElement || !anchorButton) return;

    popoverElement.style.display = 'flex';
    const rect = anchorButton.getBoundingClientRect();
    let popoverWidth = popoverContentElement.offsetWidth;
    let popoverHeight = popoverContentElement.offsetHeight;

    let top = window.scrollY + rect.top - popoverHeight - 10;
    let left = window.scrollX + rect.left + (rect.width / 2) - (popoverWidth / 2);

    if (top < window.scrollY + 10) top = window.scrollY + rect.bottom + 10;
    if (left < window.scrollX + 10) left = window.scrollX + 10;
    if (left + popoverWidth > window.scrollX + window.innerWidth - 10) left = window.scrollX + window.innerWidth - popoverWidth - 10;
    if (top + popoverHeight > window.scrollY + window.innerHeight - 10) top = window.scrollY + window.innerHeight - popoverHeight - 10;
    
    popoverContentElement.style.top = `${top}px`;
    popoverContentElement.style.left = `${left}px`;

    chrome.storage.local.get(['popoverWidth', 'popoverHeight'], (data) => {
        if (data.popoverWidth) popoverContentElement.style.width = `${data.popoverWidth}px`;
        if (data.popoverHeight) popoverContentElement.style.height = `${data.popoverHeight}px`;
    });
    applyCurrentUiStrings();
}

function closePopover() { if (popoverElement) popoverElement.style.display = 'none'; }

function updatePopoverStatus(message, type = '') { // type can be 'loading', 'error', 'success' or empty
    if (!popoverContentElement) return;
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    statusEl.textContent = message;
    statusEl.className = `prompt-enhancer-status ${type}`; // Add base class for potential general styling
}


function showLoadingState(message) {
    if (!popoverContentElement) return;
    if (popoverElement.style.display === 'none') openPopover(enhanceButton);
    updatePopoverStatus(message, 'loading');
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'none';
}

function showErrorState(errorMessage) {
    if (!popoverContentElement) return;
    if (popoverElement.style.display === 'none') openPopover(enhanceButton);
    updatePopoverStatus(errorMessage, 'error');
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'none';
}

function handleApiResponse(response) {
    if (!popoverContentElement || popoverElement.style.display === 'none') {
        log("Popover not visible for API response."); return;
    }
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'block';
    document.getElementById('prompt-enhancer-popover-actions').style.display = 'flex';

    if (response && response.enhancedPrompt) {
        updatePopoverStatus(getStr('statusDefault'), ''); // Default status when prompt is shown
        document.getElementById('prompt-enhancer-polished-prompt').value = response.enhancedPrompt;
    } else if (response && response.error) {
        showErrorState(response.error); // showErrorState already sets the status text and class
    } else {
        showErrorState(getStr('statusError')); // Generic error if response is malformed
    }
}

function makeDraggable(element, handle) {
    let offsetX, offsetY, isDragging = false;
    handle.addEventListener('mousedown', (e) => {
        // Prevent dragging if the click is on a button inside the header
        if (e.target.closest('button')) return;
        isDragging = true;
        offsetX = e.clientX - element.getBoundingClientRect().left;
        offsetY = e.clientY - element.getBoundingClientRect().top;
        handle.style.cursor = 'grabbing';
        element.style.userSelect = 'none'; // Prevent text selection during drag
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    function onMouseMove(e) {
        if (!isDragging) return;
        let newLeft = e.clientX - offsetX;
        let newTop = e.clientY - offsetY;
        newLeft = Math.max(0, Math.min(newLeft, window.innerWidth - element.offsetWidth));
        newTop = Math.max(0, Math.min(newTop, window.innerHeight - element.offsetHeight));
        element.style.left = `${newLeft}px`;
        element.style.top = `${newTop}px`;
    }
    function onMouseUp() {
        isDragging = false;
        handle.style.cursor = 'grab';
        element.style.userSelect = '';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }
}

function makeResizable(element, resizeHandle) {
    let startX, startY, startWidth, startHeight, isResizing = false;
    const minWidth = 350; const minHeight = 180;

    resizeHandle.addEventListener('mousedown', (e) => {
        e.preventDefault(); e.stopPropagation();
        isResizing = true;
        startX = e.clientX; startY = e.clientY;
        startWidth = parseInt(document.defaultView.getComputedStyle(element).width, 10);
        startHeight = parseInt(document.defaultView.getComputedStyle(element).height, 10);
        element.style.userSelect = 'none';
        document.addEventListener('mousemove', onResizeMouseMove);
        document.addEventListener('mouseup', onResizeMouseUp);
    });
    function onResizeMouseMove(e) {
        if (!isResizing) return;
        let newWidth = startWidth + (e.clientX - startX);
        let newHeight = startHeight + (e.clientY - startY);
        newWidth = Math.max(minWidth, newWidth);
        newHeight = Math.max(minHeight, newHeight);
        element.style.width = `${newWidth}px`;
        element.style.height = `${newHeight}px`;
    }
    function onResizeMouseUp() {
        if (!isResizing) return;
        isResizing = false;
        element.style.userSelect = '';
        document.removeEventListener('mousemove', onResizeMouseMove);
        document.removeEventListener('mouseup', onResizeMouseUp);
        chrome.storage.local.set({
            popoverWidth: parseInt(element.style.width, 10),
            popoverHeight: parseInt(element.style.height, 10)
        });
    }
}

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
    createPopover(); 
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
                const tempButton = enhanceButton || createEnhanceButton(currentInputElement);
                if(tempButton) openPopover(tempButton);
             }
        }
    });
    window.addEventListener('scroll', () => {
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.altKey && (event.key === 'p' || event.key === 'P')) {
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

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initialSetup, 500));
} else {
    setTimeout(initialSetup, 500);
}
