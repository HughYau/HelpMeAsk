// popup.js
document.addEventListener('DOMContentLoaded', function() {
  const apiProviderSelect = document.getElementById('apiProvider');
  const apiKeyInput = document.getElementById('apiKey');
  const apiModelInput = document.getElementById('apiModel');
  const saveButton = document.getElementById('saveButton');
  const statusElement = document.getElementById('status');

  // 加载已保存的设置
  chrome.storage.sync.get(['apiProvider', 'apiKey', 'apiModel'], function(result) {
    if (result.apiProvider) {
      apiProviderSelect.value = result.apiProvider;
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    if (result.apiModel) {
      apiModelInput.value = result.apiModel;
    }
    updateModelPlaceholder(); // 更新模型占位符
  });

  apiProviderSelect.addEventListener('change', updateModelPlaceholder);

  function updateModelPlaceholder() {
    const provider = apiProviderSelect.value;
    if (provider === 'openai') {
      apiModelInput.placeholder = "例如: gpt-3.5-turbo, gpt-4o";
    } else if (provider === 'deepseek') {
      apiModelInput.placeholder = "例如: deepseek-chat, deepseek-coder";
    } else {
      apiModelInput.placeholder = "请输入模型名称";
    }
  }

  saveButton.addEventListener('click', function() {
    const provider = apiProviderSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const apiModel = apiModelInput.value.trim();

    if (apiKey) {
      chrome.storage.sync.set({
        apiProvider: provider,
        apiKey: apiKey,
        apiModel: apiModel
      }, function() {
        statusElement.textContent = '设置已保存！';
        statusElement.style.color = 'green';
        setTimeout(() => { statusElement.textContent = ''; }, 3000);
      });
    } else {
      statusElement.textContent = '请输入 API 密钥。';
      statusElement.style.color = 'red';
    }
  });
});
