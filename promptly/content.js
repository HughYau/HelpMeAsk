// content.js (v5 - Popover UI, ChatGPT fix, Minimalist Style)

let currentInputElement = null;
let enhanceButton = null;
let popoverElement = null; // Renamed from modalElement
let originalPromptForPopover = '';
const DEBUG_MODE = true; // 设置为 true 以在控制台输出调试信息

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
    // log("Attempting to find input element...");
    const selectors = [
        'textarea#prompt-textarea', // ChatGPT
        'div[contenteditable="true"][role="textbox"][aria-multiline="true"]', // Common for newer rich text editors
        'div.ql-editor[aria-label="Message"]', // Gemini (old)
        'div[contenteditable="true"][aria-label*="Send a message"]', // Gemini (new)
        'div[contenteditable="true"][aria-label*="Prompt for"]', // Gemini (another variant)
        'div.ProseMirror[contenteditable="true"]', // Claude
        'textarea[placeholder*="Message DeepSeek"]',
        'textarea[placeholder*="向 Kimi 提问"]',
        'textarea[data-testid="chat-input"]', // Common test ID
        'textarea[aria-label*="Chat message input"]'
    ];

    for (let selector of selectors) {
        try {
            let element = document.querySelector(selector);
            if (element && isElementVisible(element)) {
                // log("Found input element with specific selector:", selector, element);
                return element;
            }
        } catch (e) { /* log("Error with selector:", selector, e); */ }
    }

    const textareas = document.querySelectorAll('textarea');
    for (let ta of textareas) {
        if (!ta.closest('#prompt-enhancer-popover') && isElementVisible(ta) && ta.offsetHeight > 20) {
            return ta;
        }
    }
    const contentEditables = document.querySelectorAll('div[contenteditable="true"]');
    for (let ce of contentEditables) {
        if (!ce.closest('#prompt-enhancer-popover') && isElementVisible(ce) && ce.offsetHeight > 20 && (ce.getAttribute('role') === 'textbox' || ce.textContent.length < 2000 ) /* Heuristic */) {
            return ce;
        }
    }
    // log("Could not find a suitable input element.");
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
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="feather feather-sparkles">
            <path d="M12 3L14.34 8.66L20 11L14.34 13.34L12 19L9.66 13.34L4 11L9.66 8.66L12 3z"/>
            <line x1="20" y1="22" x2="18" y2="20"/>
            <line x1="6" y1="4" x2="4" y2="2"/>
        </svg>
    `; // 使用SVG图标
    enhanceButton.title = '润色当前 Prompt (Alt+P)';

    const parent = targetInputElement.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }
    if (parent) {
        parent.appendChild(enhanceButton);
    } else {
        document.body.appendChild(enhanceButton);
    }
    positionEnhanceButton(targetInputElement);

    enhanceButton.addEventListener('click', (event) => {
        event.preventDefault(); // <--- 阻止默认行为，修复ChatGPT自动发送
        event.stopPropagation(); // <--- 阻止事件冒泡

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
            // 可以用一个小的提示代替alert
            const tempStatus = document.getElementById('prompt-enhancer-popover-status');
            if (tempStatus) { // 如果popover已创建
                openPopover(enhanceButton); // 打开空的popover显示提示
                tempStatus.textContent = '请输入内容后再润色！';
                tempStatus.style.color = 'orange';
                setTimeout(() => { if(popoverElement.style.display === 'flex') closePopover(); }, 2000);
            } else {
                alert('请输入内容后再进行润色！');
            }
            return;
        }
        originalPromptForPopover = promptToEnhance;
        
        openPopover(enhanceButton); // 先打开 Popover 并显示加载状态
        showLoadingInPopover('正在获取润色建议...');
        
        chrome.runtime.sendMessage({
            action: "enhancePrompt",
            prompt: originalPromptForPopover
        }).then(response => { // 使用 Promise 风格处理响应
            handleApiResponse(response);
        }).catch(error => {
            log("Error sending message to background or receiving response:", error);
            showErrorInPopover(`润色过程中发生错误: ${error.message}`);
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
    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    const buttonSize = 24; // 按钮的宽度和高度
    let topPosition = (inputRect.bottom - parent.getBoundingClientRect().top) - buttonSize - 5;
    let leftPosition = (inputRect.right - parent.getBoundingClientRect().left) - buttonSize - 5;
    
    // 确保按钮在父元素内
    topPosition = Math.max(2, Math.min(topPosition, parent.offsetHeight - buttonSize - 2));
    leftPosition = Math.max(2, Math.min(leftPosition, parent.offsetWidth - buttonSize - 2));

    enhanceButton.style.position = 'absolute';
    enhanceButton.style.top = `${topPosition}px`;
    enhanceButton.style.left = `${leftPosition}px`;
    enhanceButton.style.zIndex = '9990'; // 比popover低一点
}

// --- Popover Functions ---
function createPopover() {
    if (document.getElementById('prompt-enhancer-popover')) return;
    log("Creating popover.");
    popoverElement = document.createElement('div');
    popoverElement.id = 'prompt-enhancer-popover';
    // 使用SVG图标替换文字按钮
    popoverElement.innerHTML = `
        <div id="prompt-enhancer-popover-content">
            <div id="prompt-enhancer-popover-header">
                <span id="prompt-enhancer-popover-title">润色建议</span>
                <button id="prompt-enhancer-close-btn" title="关闭">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
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
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M1 10v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V4M1 15h16"></path><path d="M20.99 4.01V10h-6M3.04 10.01c.74-2.9 2.9-5.01 5.92-5.01 2.32 0 4.36 1.25 5.49 3.13M1 10h4M1 18h22"></path></svg> 
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

    document.getElementById('prompt-enhancer-close-btn').addEventListener('click', closePopover);
    
    document.getElementById('prompt-enhancer-replace-btn').addEventListener('click', () => {
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        if (currentInputElement) {
            if (currentInputElement.tagName.toLowerCase() === 'textarea') {
                currentInputElement.value = polishedPromptText;
            } else if (currentInputElement.isContentEditable) {
                currentInputElement.innerText = polishedPromptText;
            }
            currentInputElement.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            currentInputElement.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            currentInputElement.focus();
        }
        closePopover();
    });

    document.getElementById('prompt-enhancer-regenerate-btn').addEventListener('click', (event) => {
        event.stopPropagation(); // Prevent closing popover if it's setup to close on body click
        showLoadingInPopover('正在重新生成...');
        chrome.runtime.sendMessage({
            action: "enhancePrompt",
            prompt: originalPromptForPopover
        }).then(response => {
            handleApiResponse(response);
        }).catch(error => {
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
            statusEl.style.color = 'var(--success-color)'; // Use CSS variable
            setTimeout(() => { statusEl.textContent = ''; }, 1500);
        }).catch(err => {
            log('复制失败: ', err);
            const statusEl = document.getElementById('prompt-enhancer-popover-status');
            statusEl.textContent = '复制失败';
            statusEl.style.color = 'var(--error-color)';
        });
    });
    // Add event listener to close popover when clicking outside
    document.addEventListener('click', handleClickOutsidePopover, true);
    document.addEventListener('keydown', handleEscKey, true);
}

function handleClickOutsidePopover(event) {
    if (popoverElement && popoverElement.style.display === 'flex') {
        if (!popoverElement.contains(event.target) && event.target !== enhanceButton && !enhanceButton.contains(event.target)) {
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
    
    const rect = anchorButton.getBoundingClientRect();
    const popoverContent = popoverElement.querySelector('#prompt-enhancer-popover-content');
    
    popoverElement.style.display = 'flex'; // Show it first to calculate its dimensions
    
    // Attempt to position it above the button, aligned to the right
    let top = window.scrollY + rect.top - popoverContent.offsetHeight - 10; // 10px spacing
    let left = window.scrollX + rect.left + (rect.width / 2) - (popoverContent.offsetWidth / 2);

    // Adjust if it goes off-screen
    if (top < window.scrollY + 10) { // If too close to top or off-screen top
        top = window.scrollY + rect.bottom + 10; // Position below button
    }
    if (left < window.scrollX + 10) { // If too close to left
        left = window.scrollX + 10;
    }
    if (left + popoverContent.offsetWidth > window.scrollX + window.innerWidth - 10) { // If too close to right
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
        statusEl.style.color = 'var(--text-muted-color)';
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
        statusEl.style.color = 'var(--error-color)';
    }
    if(actionsDiv) actionsDiv.style.display = 'none'; // Hide actions on error
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
    if(statusEl) statusEl.textContent = '';
    if(actionsDiv) actionsDiv.style.display = 'flex';


    if (response && response.enhancedPrompt) {
        if(titleEl) titleEl.textContent = "润色建议";
        if(promptTextarea) promptTextarea.value = response.enhancedPrompt;
    } else if (response && response.error) {
        showErrorInPopover(response.error); // Reuse showErrorInPopover for consistency
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
                enhanceButton = null;
                createEnhanceButton(currentInputElement);
            } else if (enhanceButton && document.body.contains(enhanceButton)) {
                positionEnhanceButton(currentInputElement);
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

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });

    document.addEventListener('focusin', (event) => {
        if (event.target && (event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)) {
            if (isElementVisible(event.target) && event.target.offsetHeight > 20 && !event.target.closest('#prompt-enhancer-popover')) {
                setTimeout(attemptToAttachButton, 50); // Slight delay
            }
        }
    });
    
    window.addEventListener('resize', () => {
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
        if(popoverElement && popoverElement.style.display === 'flex' && enhanceButton) openPopover(enhanceButton); // Re-position open popover
    });
    window.addEventListener('scroll', () => {
        if(currentInputElement && enhanceButton) positionEnhanceButton(currentInputElement);
        // Popover is fixed position relative to viewport, so scroll doesn't directly affect its content's top/left.
        // However, if the anchor button moves, we might want to re-evaluate.
        // For now, rely on resize or re-click to re-anchor.
    }, true);

    // Shortcut key: Alt+P (or Option+P on Mac)
    document.addEventListener('keydown', (event) => {
        if (event.altKey && event.key === 'p') {
            event.preventDefault();
            event.stopPropagation();
            if (enhanceButton && enhanceButton.style.display !== 'none') {
                enhanceButton.click();
            } else if (currentInputElement) { // If button not visible but input found
                attemptToAttachButton(); // Try to make button visible
                setTimeout(() => { // Then click it
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
