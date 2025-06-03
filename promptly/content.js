// content.js (v6 - Theming, Wider Popover, Text Fixes)

let currentInputElement = null;
let enhanceButton = null;
let popoverElement = null;
let originalPromptForPopover = '';
const DEBUG_MODE = true;
let currentTheme = 'light'; // Default theme

function log(...args) {
    if (DEBUG_MODE) {
        console.log("[PromptEnhancer]", ...args);
    }
}

function isElementVisible(elem) {
    if (!(elem instanceof Element)) return false;
    const style = window.getComputedStyle(elem);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    if (elem.offsetWidth < 1 && elem.offsetHeight < 1 && elem.getClientRects().length === 0) {
        return false;
    }
    return true;
}

function findInputElement() {
    const selectors = [
        'textarea#prompt-textarea', // ChatGPT
        'div[contenteditable="true"][role="textbox"][aria-multiline="true"]',
        'div.ql-editor[aria-label="Message"]', // Gemini (old)
        'div[contenteditable="true"][aria-label*="Send a message"]', // Gemini (new)
        'div[contenteditable="true"][aria-label*="Prompt for"]',
        'div.ProseMirror[contenteditable="true"]', // Claude
        'textarea[placeholder*="Message DeepSeek"]',
        'textarea[placeholder*="向 Kimi 提问"]',
        'textarea[data-testid="chat-input"]',
        'textarea[aria-label*="Chat message input"]'
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
        positionEnhanceButton(targetInputElement);
        return;
    }
    log("Creating enhance button for target:", targetInputElement);
    enhanceButton = document.createElement('button');
    enhanceButton.id = 'prompt-enhance-button';
    enhanceButton.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3L14.34 8.66L20 11L14.34 13.34L12 19L9.66 13.34L4 11L9.66 8.66L12 3z"/><line x1="20" y1="22" x2="18" y2="20"/><line x1="6" y1="4" x2="4" y2="2"/></svg>`;
    enhanceButton.title = '润色当前 Prompt (Alt+P)';

    const parent = targetInputElement.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }
    if (parent) parent.appendChild(enhanceButton);
    else document.body.appendChild(enhanceButton);
    
    positionEnhanceButton(targetInputElement);
    applyThemeToElement(enhanceButton); // Apply theme to the button itself

    enhanceButton.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        log("Enhance button clicked.");
        if (popoverElement && popoverElement.style.display === 'flex') {
            closePopover();
            return;
        }
        let promptToEnhance = '';
        if (targetInputElement.tagName.toLowerCase() === 'textarea') {
            promptToEnhance = targetInputElement.value;
        } else if (targetInputElement.isContentEditable) {
            promptToEnhance = targetInputElement.innerText || targetInputElement.textContent;
        }
        if (!promptToEnhance.trim()) {
            openPopover(enhanceButton);
            showErrorInPopover('请输入内容后再润色！');
            setTimeout(() => { if(popoverElement && popoverElement.style.display === 'flex') closePopover(); }, 2000);
            return;
        }
        originalPromptForPopover = promptToEnhance;
        openPopover(enhanceButton);
        showLoadingInPopover('正在获取润色建议...');
        chrome.runtime.sendMessage({ action: "enhancePrompt", prompt: originalPromptForPopover })
            .then(handleApiResponse)
            .catch(error => {
                log("Error sending/receiving message:", error);
                showErrorInPopover(`润色出错: ${error.message}`);
            });
    });
}

function positionEnhanceButton(targetInputElement) {
    if (!enhanceButton || !targetInputElement || !isElementVisible(targetInputElement)) {
        if (enhanceButton) enhanceButton.style.display = 'none';
        return;
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

// --- Popover and Theme Functions ---
function applyTheme(theme) {
    currentTheme = theme;
    const popoverContent = document.getElementById('prompt-enhancer-popover-content');
    if (popoverContent) {
        popoverContent.classList.remove('prompt-enhancer-light-theme', 'prompt-enhancer-dark-theme');
        popoverContent.classList.add(`prompt-enhancer-${theme}-theme`);
    }
    // Apply theme to the floating button as well
    applyThemeToElement(enhanceButton);
    applyThemeToElement(document.body); // To make CSS variables available more globally if needed for button

    // Update theme toggle icon
    const themeToggleBtn = document.getElementById('prompt-enhancer-theme-toggle');
    if (themeToggleBtn) {
        themeToggleBtn.innerHTML = theme === 'light' ?
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>` : // Moon for dark
            `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`; // Sun for light
        themeToggleBtn.title = theme === 'light' ? '切换到深色主题' : '切换到浅色主题';
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
    chrome.storage.sync.set({ enhancerTheme: newTheme }, () => {
        log(`Theme saved: ${newTheme}`);
    });
}

function loadTheme() {
    chrome.storage.sync.get('enhancerTheme', (data) => {
        const savedTheme = data.enhancerTheme || 'light'; // Default to light
        applyTheme(savedTheme);
        log(`Theme loaded: ${savedTheme}`);
    });
}

function createPopover() {
    if (document.getElementById('prompt-enhancer-popover')) return;
    log("Creating popover.");
    popoverElement = document.createElement('div');
    popoverElement.id = 'prompt-enhancer-popover';
    
    popoverElement.innerHTML = `
        <div id="prompt-enhancer-popover-content">
            <div id="prompt-enhancer-popover-header">
                <span id="prompt-enhancer-popover-title">润色建议</span>
                <div>
                    <button id="prompt-enhancer-theme-toggle" title="切换主题"></button>
                    <button id="prompt-enhancer-close-btn" title="关闭">
                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>
            </div>
            <div id="prompt-enhancer-popover-body">
                <textarea id="prompt-enhancer-polished-prompt" readonly></textarea>
                <p id="prompt-enhancer-popover-status"></p>
            </div>
            <div id="prompt-enhancer-popover-actions">
                <button id="prompt-enhancer-replace-btn" class="popover-action-btn" title="替换原文">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                    <span>替换</span>
                </button>
                <button id="prompt-enhancer-regenerate-btn" class="popover-action-btn" title="重新生成">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 4 1 10 7 10"></polyline><polyline points="23 20 23 14 17 14"></polyline><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"></path></svg>
                    <span>刷新</span>
                </button>
                <button id="prompt-enhancer-copy-btn" class="popover-action-btn" title="复制">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    <span>复制</span>
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(popoverElement);
    loadTheme(); // Load and apply theme when popover is created

    document.getElementById('prompt-enhancer-close-btn').addEventListener('click', closePopover);
    document.getElementById('prompt-enhancer-theme-toggle').addEventListener('click', toggleTheme);
    
    document.getElementById('prompt-enhancer-replace-btn').addEventListener('click', () => {
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        if (currentInputElement) {
            if (currentInputElement.tagName.toLowerCase() === 'textarea') {
                currentInputElement.value = polishedPromptText;
            } else if (currentInputElement.isContentEditable) {
                currentInputElement.innerText = polishedPromptText; // Use innerText for contenteditable
            }
            // Dispatch input and change events for frameworks like React/Vue
            currentInputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            currentInputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            currentInputElement.focus();
        }
        closePopover();
    });

    document.getElementById('prompt-enhancer-regenerate-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        showLoadingInPopover('正在重新生成...');
        chrome.runtime.sendMessage({ action: "enhancePrompt", prompt: originalPromptForPopover })
            .then(handleApiResponse)
            .catch(error => {
                log("重新生成时出错:", error);
                showErrorInPopover(`重新生成失败: ${error.message}`);
            });
    });
    
    document.getElementById('prompt-enhancer-copy-btn').addEventListener('click', (event) => {
        event.stopPropagation();
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        navigator.clipboard.writeText(polishedPromptText).then(() => {
            const statusEl = document.getElementById('prompt-enhancer-popover-status');
            statusEl.textContent = '已复制！';
            statusEl.className = 'success'; // Use class for styling
            setTimeout(() => { statusEl.textContent = ''; statusEl.className = ''; }, 1500);
        }).catch(err => {
            log('复制失败: ', err);
            const statusEl = document.getElementById('prompt-enhancer-popover-status');
            statusEl.textContent = '复制失败';
            statusEl.className = 'error';
        });
    });

    document.addEventListener('click', handleClickOutsidePopover, true);
    document.addEventListener('keydown', handleEscKey, true);
}

function handleClickOutsidePopover(event) {
    if (popoverElement && popoverElement.style.display === 'flex') {
        const popoverContent = document.getElementById('prompt-enhancer-popover-content');
        if (popoverContent && !popoverContent.contains(event.target) && event.target !== enhanceButton && !enhanceButton.contains(event.target)) {
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
    if (!popoverElement) createPopover();
    else loadTheme(); // Ensure theme is up-to-date when opening
    
    const popoverContent = document.getElementById('prompt-enhancer-popover-content');
    if (!popoverContent) return;

    const rect = anchorButton.getBoundingClientRect();
    popoverElement.style.display = 'flex';
    
    let top = window.scrollY + rect.top - popoverContent.offsetHeight - 10;
    let left = window.scrollX + rect.left + (rect.width / 2) - (popoverContent.offsetWidth / 2);

    if (top < window.scrollY + 10) top = window.scrollY + rect.bottom + 10;
    if (left < window.scrollX + 10) left = window.scrollX + 10;
    if (left + popoverContent.offsetWidth > window.scrollX + window.innerWidth - 10) {
        left = window.scrollX + window.innerWidth - popoverContent.offsetWidth - 10;
    }
    
    popoverContent.style.top = `${top}px`;
    popoverContent.style.left = `${left}px`;
    log("Popover opened and positioned.");
}

function closePopover() {
    if (popoverElement) {
        popoverElement.style.display = 'none';
        log("Popover closed.");
    }
}

function showLoadingInPopover(message) {
    if (!popoverElement || popoverElement.style.display === 'none') openPopover(enhanceButton);

    const titleEl = document.getElementById('prompt-enhancer-popover-title');
    const promptTextarea = document.getElementById('prompt-enhancer-polished-prompt');
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    const actionsDiv = document.getElementById('prompt-enhancer-popover-actions');

    if(titleEl) titleEl.textContent = "处理中...";
    if(promptTextarea) {
        promptTextarea.value = '';
        promptTextarea.style.display = 'none';
    }
    if(statusEl) {
        statusEl.textContent = message;
        statusEl.className = ''; // Neutral class
    }
    if(actionsDiv) actionsDiv.style.display = 'none';
}

function showErrorInPopover(errorMessage) {
    if (!popoverElement || popoverElement.style.display === 'none') openPopover(enhanceButton);

    const titleEl = document.getElementById('prompt-enhancer-popover-title');
    const promptTextarea = document.getElementById('prompt-enhancer-polished-prompt');
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    const actionsDiv = document.getElementById('prompt-enhancer-popover-actions');
    
    if(titleEl) titleEl.textContent = "操作失败";
    if(promptTextarea) promptTextarea.style.display = 'none';
    if(statusEl) {
        statusEl.textContent = errorMessage;
        statusEl.className = 'error';
    }
    if(actionsDiv) actionsDiv.style.display = 'none';
}

function handleApiResponse(response) {
    if (!popoverElement || popoverElement.style.display === 'none') {
        log("Popover not visible, cannot handle API response.");
        return;
    }
    const titleEl = document.getElementById('prompt-enhancer-popover-title');
    const promptTextarea = document.getElementById('prompt-enhancer-polished-prompt');
    const statusEl = document.getElementById('prompt-enhancer-popover-status');
    const actionsDiv = document.getElementById('prompt-enhancer-popover-actions');

    if(promptTextarea) promptTextarea.style.display = 'block';
    if(statusEl) {
        statusEl.textContent = '';
        statusEl.className = '';
    }
    if(actionsDiv) actionsDiv.style.display = 'flex';

    if (response && response.enhancedPrompt) {
        if(titleEl) titleEl.textContent = "润色建议";
        if(promptTextarea) promptTextarea.value = response.enhancedPrompt;
    } else if (response && response.error) {
        showErrorInPopover(response.error);
    } else {
        showErrorInPopover("未能获取有效的润色建议。");
    }
}

// --- Initialization and Observation Logic ---
let debounceTimer;
function attemptToAttachButton() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        const newInputElement = findInputElement();
        if (newInputElement) {
            if (newInputElement !== currentInputElement || !enhanceButton || !document.body.contains(enhanceButton)) {
                currentInputElement = newInputElement;
                if (enhanceButton && enhanceButton.parentNode) {
                    enhanceButton.parentNode.removeChild(enhanceButton);
                }
                enhanceButton = null; // Ensure it's recreated
                createEnhanceButton(currentInputElement);
            } else if (enhanceButton && document.body.contains(enhanceButton)) {
                positionEnhanceButton(currentInputElement);
                applyThemeToElement(enhanceButton); // Re-apply theme in case classes were lost
            }
        } else {
            if (enhanceButton) enhanceButton.style.display = 'none';
            currentInputElement = null;
        }
    }, 300); 
}

const observer = new MutationObserver(() => {
    attemptToAttachButton();
});

function initialSetup() {
    log("PromptEnhancer: Initial setup running.");
    createPopover(); // Create popover structure once on load, keep it hidden
    attemptToAttachButton();

    observer.observe(document.body, { childList: true, subtree: true });

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
             // Re-position open popover, ensure anchorButton is valid
             const currentAnchor = document.getElementById('prompt-enhance-button');
             if (currentAnchor && isElementVisible(currentAnchor)) {
                openPopover(currentAnchor);
             } else if (currentInputElement && isElementVisible(currentInputElement)) {
                // Fallback if button somehow detached but input is there
                const tempButton = enhanceButton || createEnhanceButton(currentInputElement);
                if (tempButton) openPopover(tempButton);
             }
        }
    });
    window.addEventListener('scroll', () => {
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
    }, true);

    document.addEventListener('keydown', (event) => {
        if (event.altKey && event.key === 'p') {
            event.preventDefault();
            event.stopPropagation();
            if (enhanceButton && enhanceButton.style.display !== 'none') {
                enhanceButton.click();
            } else if (currentInputElement) {
                attemptToAttachButton();
                setTimeout(() => {
                    if (enhanceButton && enhanceButton.style.display !== 'none') {
                        enhanceButton.click();
                    }
                }, 100);
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
