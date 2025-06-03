// content.js (v4 - Debugging button not appearing)

let currentInputElement = null;
let enhanceButton = null;
let modalElement = null;
let originalPromptForModal = '';
const DEBUG_MODE = true; // 设置为 true 以在控制台输出调试信息

function log(...args) {
    if (DEBUG_MODE) {
        console.log("[PromptEnhancer]", ...args);
    }
}

// 检查元素是否可见的辅助函数
function isElementVisible(elem) {
    if (!(elem instanceof Element)) return false;
    const style = window.getComputedStyle(elem);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return false;
    }
    // 检查尺寸，对于某些伪隐藏元素（例如尺寸为0）
    if (elem.offsetWidth < 1 && elem.offsetHeight < 1 && elem.getClientRects().length === 0) {
        return false;
    }
    return true;
}


// 查找页面上的主要输入框的函数
function findInputElement() {
    log("Attempting to find input element...");

    // 针对特定网站的已知选择器 (优先级高)
    // 注意：这些选择器需要根据网站的实际HTML结构进行调整和测试
    const specificSelectors = [
        // ChatGPT (截至2024-2025初)
        'textarea#prompt-textarea',
        // Gemini (截至2024-2025初 - Gemini 的输入框可能是 div contenteditable)
        'div.ql-editor[aria-label="Message"]', // 较旧的 Gemini
        'div[contenteditable="true"][aria-label*="Send a message"]', // 较新的 Gemini
        'div[contenteditable="true"][aria-label*="Prompt"]',
        'div[contenteditable="true"][aria-label*="prompt"]',
        'div[contenteditable="true"][role="textbox"]',
        // Claude
        'div.ProseMirror[contenteditable="true"]',
        'textarea[data-id="root"]', // 旧版 Claude
        // DeepSeek Chat
        'textarea[placeholder*="Message DeepSeek"]',
        // Kimi Chat
        'textarea[placeholder*="向 Kimi 提问"]',
    ];

    for (let selector of specificSelectors) {
        try {
            let element = document.querySelector(selector);
            if (element && isElementVisible(element)) {
                log("Found input element with specific selector:", selector, element);
                return element;
            }
        } catch (e) { log("Error with selector:", selector, e); }
    }

    log("Specific selectors did not find a visible input. Trying generic selectors...");

    // 通用选择器 (尝试 textarea)
    const textareas = document.querySelectorAll('textarea');
    for (let ta of textareas) {
        // 排除模态框内的 textarea 和不可见的 textarea
        if (!ta.closest('#prompt-enhancer-modal') && isElementVisible(ta) && ta.offsetHeight > 20) {
            const placeholder = ta.placeholder ? ta.placeholder.toLowerCase() : "";
            const ariaLabel = ta.getAttribute('aria-label') ? ta.getAttribute('aria-label').toLowerCase() : "";
            if (placeholder.includes('message') || placeholder.includes('prompt') || placeholder.includes('问题') || placeholder.includes('发送') ||
                ariaLabel.includes('message') || ariaLabel.includes('prompt') || ariaLabel.includes('问题') || ariaLabel.includes('发送')) {
                log("Found textarea with generic check:", ta);
                return ta;
            }
        }
    }

    // 通用选择器 (尝试 contenteditable div)
    const contentEditables = document.querySelectorAll('div[contenteditable="true"]');
    for (let ce of contentEditables) {
        if (!ce.closest('#prompt-enhancer-modal') && isElementVisible(ce) && ce.offsetHeight > 20) {
            const ariaLabel = ce.getAttribute('aria-label') ? ce.getAttribute('aria-label').toLowerCase() : "";
            const role = ce.getAttribute('role');
             if (ariaLabel.includes('message') || ariaLabel.includes('prompt') || ariaLabel.includes('问题') || ariaLabel.includes('发送') || (role === 'textbox' || role === 'searchbox')) {
                log("Found contenteditable div with generic check:", ce);
                return ce;
            }
        }
    }

    log("Could not find a suitable input element on this page.");
    return null;
}


function createEnhanceButton(targetInputElement) {
    if (document.getElementById('prompt-enhance-button')) {
        log("Enhance button already exists. Repositioning.");
        positionButton(targetInputElement);
        return;
    }

    log("Creating enhance button for target:", targetInputElement);
    enhanceButton = document.createElement('button');
    enhanceButton.id = 'prompt-enhance-button';
    enhanceButton.innerHTML = '✨';
    enhanceButton.title = '润色当前 Prompt';

    // 确保父元素可以容纳绝对/相对定位的按钮
    const parent = targetInputElement.parentNode;
    if (parent && getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }
    
    // 初始时先简单地附加到父节点，确保按钮能被创建和看到
    if (parent) {
        parent.appendChild(enhanceButton); // 先附加，再定位
        log("Button appended to parent:", parent);
    } else {
        // 如果没有父节点（不太可能），直接附加到 body，但这通常不是好主意
        document.body.appendChild(enhanceButton);
        log("Button appended to body (no parent for target).");
    }
    
    positionButton(targetInputElement); // 然后尝试精确定位

    enhanceButton.addEventListener('click', async () => {
        log("Enhance button clicked.");
        let promptToEnhance = '';
        if (targetInputElement.tagName.toLowerCase() === 'textarea') {
            promptToEnhance = targetInputElement.value;
        } else if (targetInputElement.isContentEditable) {
            // 对于 contenteditable div，获取其纯文本内容
            promptToEnhance = targetInputElement.innerText || targetInputElement.textContent;
        }

        if (!promptToEnhance.trim()) {
            alert('请输入内容后再进行润色！');
            return;
        }
        originalPromptForModal = promptToEnhance;
        
        showLoadingInModal('正在获取润色建议...');
        try {
            const response = await chrome.runtime.sendMessage({
                action: "enhancePrompt",
                prompt: originalPromptForModal
            });
            handleApiResponse(response);
        } catch (error) {
            log("Error sending message to background or receiving response:", error);
            showErrorInModal(`润色过程中发生错误: ${error.message}`);
        }
    });
}

function positionButton(targetInputElement) {
    if (!enhanceButton || !targetInputElement || !isElementVisible(targetInputElement)) {
        if (enhanceButton) {
            enhanceButton.style.display = 'none';
            log("Hiding button because target input is not visible or doesn't exist.");
        }
        return;
    }
    enhanceButton.style.display = 'flex';

    const inputRect = targetInputElement.getBoundingClientRect();
    const buttonSize = 28; // 按钮的宽度和高度

    // 尝试将按钮定位在输入框的右下角内部
    // 使用 fixed 定位是相对于视口的，如果输入框滚动，按钮不会跟随
    // 改为 absolute 定位，相对于最近的已定位祖先元素
    // 确保 targetInputElement.parentNode 有 position: relative/absolute/fixed
    
    const parent = targetInputElement.parentNode;
    if (!parent) {
        log("Cannot position button: target input has no parentNode.");
        enhanceButton.style.display = 'none';
        return;
    }
    
    // 确保父元素有定位上下文
    if (getComputedStyle(parent).position === 'static') {
        parent.style.position = 'relative';
    }

    // 计算相对于父元素的位置
    // inputRect.top 和 inputRect.left 是相对于视口的
    // parent.getBoundingClientRect().top 和 parent.getBoundingClientRect().left 也是相对于视口的
    // 所以 top/left 应该是 inputRect 相对于 parent 的位置
    
    let topPosition = (inputRect.bottom - parent.getBoundingClientRect().top) - buttonSize - 5; // 5px 向上偏移
    let leftPosition = (inputRect.right - parent.getBoundingClientRect().left) - buttonSize - 5; // 5px 向左偏移

    // 确保按钮不会超出父元素的边界太多（简单检查）
    topPosition = Math.max(0, Math.min(topPosition, parent.offsetHeight - buttonSize));
    leftPosition = Math.max(0, Math.min(leftPosition, parent.offsetWidth - buttonSize));

    enhanceButton.style.position = 'absolute';
    enhanceButton.style.top = `${topPosition}px`;
    enhanceButton.style.left = `${leftPosition}px`;
    enhanceButton.style.zIndex = '9999'; // 确保在输入框之上，但在模态框之下

    log(`Button positioned at: top=${topPosition}px, left=${leftPosition}px (relative to parent)`);
}


// --- Modal Functions (与 v3 版本类似，确保它们存在) ---
function createModal() {
    if (document.getElementById('prompt-enhancer-modal')) return;
    log("Creating modal.");
    modalElement = document.createElement('div');
    modalElement.id = 'prompt-enhancer-modal';
    // ... (省略模态框的 innerHTML 和事件监听器，与 v3 版本相同)
    // 请确保从 prompt_enhancer_content_js_v3 复制完整的模态框创建和处理逻辑
    modalElement.innerHTML = `
        <div id="prompt-enhancer-modal-content">
            <h3 id="prompt-enhancer-modal-title">Prompt 润色建议</h3>
            <div id="prompt-enhancer-modal-body">
                <p id="prompt-enhancer-original-prompt-display" style="display:none;"></p>
                <textarea id="prompt-enhancer-polished-prompt" readonly></textarea>
                <p id="prompt-enhancer-modal-status"></p>
            </div>
            <div id="prompt-enhancer-modal-actions">
                <button id="prompt-enhancer-replace-btn" class="modal-btn">替换原文</button>
                <button id="prompt-enhancer-regenerate-btn" class="modal-btn">重新生成</button>
                <button id="prompt-enhancer-copy-btn" class="modal-btn">复制</button>
                <button id="prompt-enhancer-cancel-btn" class="modal-btn cancel">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modalElement);

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
        closeModal();
    });

    document.getElementById('prompt-enhancer-regenerate-btn').addEventListener('click', async () => {
        showLoadingInModal('正在重新生成...');
        try {
            const response = await chrome.runtime.sendMessage({
                action: "enhancePrompt",
                prompt: originalPromptForModal
            });
            handleApiResponse(response);
        } catch (error) {
            log("重新生成时出错:", error);
            showErrorInModal(`重新生成失败: ${error.message}`);
        }
    });
    
    document.getElementById('prompt-enhancer-copy-btn').addEventListener('click', () => {
        const polishedPromptText = document.getElementById('prompt-enhancer-polished-prompt').value;
        navigator.clipboard.writeText(polishedPromptText).then(() => {
            const statusEl = document.getElementById('prompt-enhancer-modal-status');
            statusEl.textContent = '已复制到剪贴板！';
            statusEl.style.color = 'green';
            setTimeout(() => { statusEl.textContent = ''; }, 2000);
        }).catch(err => {
            log('复制失败: ', err);
            const statusEl = document.getElementById('prompt-enhancer-modal-status');
            statusEl.textContent = '复制失败。';
            statusEl.style.color = 'red';
        });
    });

    document.getElementById('prompt-enhancer-cancel-btn').addEventListener('click', closeModal);
    modalElement.addEventListener('click', (e) => {
        if (e.target === modalElement) {
            closeModal();
        }
    });
}

function showLoadingInModal(message) {
    if (!modalElement) createModal();
    modalElement.style.display = 'flex';
    document.getElementById('prompt-enhancer-modal-title').textContent = "处理中";
    document.getElementById('prompt-enhancer-polished-prompt').value = '';
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    document.getElementById('prompt-enhancer-modal-status').textContent = message;
    document.getElementById('prompt-enhancer-modal-status').style.color = '#555';
    document.getElementById('prompt-enhancer-replace-btn').style.display = 'none';
    document.getElementById('prompt-enhancer-regenerate-btn').style.display = 'none';
    document.getElementById('prompt-enhancer-copy-btn').style.display = 'none';
}

function showErrorInModal(errorMessage) {
    if (!modalElement) createModal();
    modalElement.style.display = 'flex';
    document.getElementById('prompt-enhancer-modal-title').textContent = "操作失败";
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'none';
    document.getElementById('prompt-enhancer-modal-status').textContent = errorMessage;
    document.getElementById('prompt-enhancer-modal-status').style.color = 'red';
    document.getElementById('prompt-enhancer-replace-btn').style.display = 'none';
    document.getElementById('prompt-enhancer-regenerate-btn').style.display = 'none';
    document.getElementById('prompt-enhancer-copy-btn').style.display = 'none';
}

function handleApiResponse(response) { // Removed targetInputElement from params as it's global (currentInputElement)
    if (!modalElement) createModal();
    modalElement.style.display = 'flex';
    document.getElementById('prompt-enhancer-polished-prompt').style.display = 'block';
    document.getElementById('prompt-enhancer-modal-status').textContent = '';

    if (response && response.enhancedPrompt) {
        document.getElementById('prompt-enhancer-modal-title').textContent = "Prompt 润色建议";
        document.getElementById('prompt-enhancer-polished-prompt').value = response.enhancedPrompt;
        document.getElementById('prompt-enhancer-replace-btn').style.display = 'inline-block';
        document.getElementById('prompt-enhancer-regenerate-btn').style.display = 'inline-block';
        document.getElementById('prompt-enhancer-copy-btn').style.display = 'inline-block';
    } else if (response && response.error) {
        showErrorInModal(response.error);
    } else {
        showErrorInModal("未能获取有效的润色建议，请检查后台日志或 API 设置。");
    }
}

function closeModal() {
    if (modalElement) {
        modalElement.style.display = 'none';
    }
}
// --- End Modal Functions ---


// --- Initialization and Observation Logic ---
let debounceTimer;
function attemptToAttachButton() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        log("Debounced attemptToAttachButton called.");
        const newInputElement = findInputElement();
        if (newInputElement) {
            if (newInputElement !== currentInputElement || !enhanceButton || !document.body.contains(enhanceButton)) {
                log("New or different input element found, or button missing. Recreating/Re-attaching.", newInputElement);
                currentInputElement = newInputElement;
                if (enhanceButton && enhanceButton.parentNode) {
                    enhanceButton.parentNode.removeChild(enhanceButton); // Remove old button if exists
                }
                enhanceButton = null; // Reset button
                createEnhanceButton(currentInputElement);
            } else if (enhanceButton && document.body.contains(enhanceButton)) {
                log("Input element is the same, ensuring button is positioned.");
                positionButton(currentInputElement); // Ensure correct position if input field moved/resized
            }
        } else {
            log("No suitable input element found. Hiding button if it exists.");
            if (enhanceButton) {
                enhanceButton.style.display = 'none';
            }
            currentInputElement = null; // No active input
        }
    }, 500); // 500ms debounce, adjust as needed
}


const observer = new MutationObserver((mutationsList) => {
    // A simple trigger: if anything changes in the body's subtree, re-evaluate.
    // This can be performance-intensive on very dynamic pages.
    // Consider making it more specific if needed, e.g., by checking mutations for added/removed nodes
    // that could be our target input or its container.
    // for (const mutation of mutationsList) {
    //    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
            // log("MutationObserver detected added nodes.");
            attemptToAttachButton();
    //        break; 
    //    }
    // }
});

function initialSetup() {
    log("Initial setup running.");
    createModal(); // Create modal structure once on load
    attemptToAttachButton(); // Initial attempt to find and attach button

    observer.observe(document.body, {
        childList: true,
        subtree: true,
        // attributes: false, // Observing attributes can be very noisy.
        // attributeFilter: ['style', 'class'] // Only observe specific attributes if needed.
    });

    // Listen for focus events as another way to detect active input fields
    document.addEventListener('focusin', (event) => {
        if (event.target && (event.target.tagName === 'TEXTAREA' || event.target.isContentEditable)) {
            log("Focusin event on potential input:", event.target);
            // If the focused element could be our target, try to attach/update the button
            if (isElementVisible(event.target) && event.target.offsetHeight > 20 && !event.target.closest('#prompt-enhancer-modal')) {
                 // A small delay to ensure the element is fully "settled" in the DOM after focus
                setTimeout(() => attemptToAttachButton(), 100);
            }
        }
    });
    
    window.addEventListener('resize', attemptToAttachButton); // Reposition on resize
    window.addEventListener('scroll', attemptToAttachButton, true); // Reposition on scroll (use capture for wider coverage)

    log("Initial setup complete. Observer and event listeners active.");
}

// Run initial setup after a delay to give the page a chance to load its main components.
// For SPAs, DOM might change significantly after initial load.
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(initialSetup, 1000));
} else {
    setTimeout(initialSetup, 1000); // If already loaded, still wait a bit.
}
