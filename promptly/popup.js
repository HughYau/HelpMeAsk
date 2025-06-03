// popup.js
document.addEventListener('DOMContentLoaded', function() {
  const uiLanguageSelect = document.getElementById('uiLanguage');
  const apiProviderSelect = document.getElementById('apiProvider');
  const apiKeyInput = document.getElementById('apiKey');
  const apiModelInput = document.getElementById('apiModel');
  const saveButton = document.getElementById('saveButton');
  const statusElement = document.getElementById('status');

  // Load saved settings
  chrome.storage.sync.get(['uiLanguage', 'apiProvider', 'apiKey', 'apiModel'], function(result) {
    if (result.uiLanguage) {
      uiLanguageSelect.value = result.uiLanguage;
    } else {
      uiLanguageSelect.value = 'en'; // Default to English
    }
    if (result.apiProvider) {
      apiProviderSelect.value = result.apiProvider;
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
    if (result.apiModel) {
      apiModelInput.value = result.apiModel;
    }
    updateModelPlaceholder();
  });

  apiProviderSelect.addEventListener('change', updateModelPlaceholder);

  function updateModelPlaceholder() {
    const provider = apiProviderSelect.value;
    let placeholder = "Enter model name (e.g., ";
    switch (provider) {
      case 'openai':
        placeholder += "gpt-4o, gpt-3.5-turbo)";
        break;
      case 'deepseek':
        placeholder += "deepseek-chat, deepseek-coder)";
        break;
      case 'anthropic':
        placeholder += "claude-3-opus-20240229, claude-3-sonnet-20240229)";
        break;
      case 'google':
        placeholder += "gemini-1.5-flash-latest, gemini-pro)";
        break;
      default:
        placeholder = "Enter model name";
    }
    apiModelInput.placeholder = placeholder;
  }

  saveButton.addEventListener('click', function() {
    const language = uiLanguageSelect.value;
    const provider = apiProviderSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const apiModel = apiModelInput.value.trim();

    if (!apiKey) {
      statusElement.textContent = uiLanguageSelect.value === 'zh' ? '请输入 API 密钥。' : 'Please enter an API Key.';
      statusElement.style.color = 'red';
      return;
    }

    chrome.storage.sync.set({
      uiLanguage: language,
      apiProvider: provider,
      apiKey: apiKey,
      apiModel: apiModel
    }, function() {
      statusElement.textContent = uiLanguageSelect.value === 'zh' ? '设置已保存！' : 'Settings saved!';
      statusElement.style.color = 'green';
      setTimeout(() => { statusElement.textContent = ''; }, 3000);
    });
  });
});
