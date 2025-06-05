// popup.js
// Handles the logic for the extension's settings popup.

document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements
  const uiLanguageSelect = document.getElementById('uiLanguage');
  const defaultRefinementStyleSelect = document.getElementById('defaultRefinementStyle');
  const apiProviderSelect = document.getElementById('apiProvider');
  const apiKeyInput = document.getElementById('apiKey');
  const apiModelInput = document.getElementById('apiModel');
  const modelHintElement = document.getElementById('modelHint');
  const saveButton = document.getElementById('saveButton');
  const statusElement = document.getElementById('status');

  console.log("Popup DOMContentLoaded: Initializing settings panel.");

  // Localization strings for popup UI elements
  const i18nStrings = {
    en: {
      settingsTitle: "Settings",
      labelUiLanguage: "UI Language",
      labelDefaultRefinementStyle: "Default Style",
      styleBalanced: "Balanced", // Default will be added in JS if needed
      styleSubtle: "Subtle",
      styleCreative: "Creative",
      styleConcise: "Concise",
      styleProgramming: "Programming",
      labelApiProvider: "API Provider",
      labelApiKey: "API Key",
      labelApiModel: "Model Name",
      buttonSaveSettings: "Save Settings",
      statusSettingsSaved: "Settings saved successfully!",
      statusApiKeyNeeded: "API Key is required.",
      statusModelNameNeededOpenRouter: "Model name is required for OpenRouter.",
      // Placeholders (concise examples)
      placeholderOpenAI: "e.g., gpt-4o",
      placeholderDeepSeek: "e.g., deepseek-chat",
      placeholderAnthropic: "e.g., claude-3-opus",
      placeholderGoogle: "e.g., gemini-1.5-flash",
      placeholderOpenRouter: "provider/model-name",
      placeholderDefault: "Enter model name",
      // Hints (more descriptive)
      hintOpenAI: "Optional. Defaults to gpt-3.5-turbo.",
      hintDeepSeek: "Optional. Defaults to deepseek-chat.",
      hintAnthropic: "Optional. Defaults to claude-3-haiku-20240307.",
      hintGoogle: "Optional. Defaults to gemini-1.5-flash-latest.",
      hintOpenRouter: "Required. Example: openai/gpt-4o.",
    },
    zh: {
      settingsTitle: "设置",
      labelUiLanguage: "界面语言",
      labelDefaultRefinementStyle: "默认风格",
      styleBalanced: "平衡", // (默认)
      styleSubtle: "微调",
      styleCreative: "创意扩展",
      styleConcise: "简洁直接",
      styleProgramming: "编程专用",
      labelApiProvider: "API 服务商",
      labelApiKey: "API 密钥",
      labelApiModel: "模型名称",
      buttonSaveSettings: "保存设置",
      statusSettingsSaved: "设置已成功保存！",
      statusApiKeyNeeded: "请输入 API 密钥。",
      statusModelNameNeededOpenRouter: "OpenRouter 需要指定模型名称。",
      // Placeholders (concise examples)
      placeholderOpenAI: "例如: gpt-4o",
      placeholderDeepSeek: "例如: deepseek-chat",
      placeholderAnthropic: "例如: claude-3-opus",
      placeholderGoogle: "例如: gemini-1.5-flash",
      placeholderOpenRouter: "服务商/模型名",
      placeholderDefault: "请输入模型名称",
      // Hints (more descriptive)
      hintOpenAI: "可选。默认为 gpt-3.5-turbo。",
      hintDeepSeek: "可选。默认为 deepseek-chat。",
      hintAnthropic: "可选。默认为 claude-3-haiku-20240307。",
      hintGoogle: "可选。默认为 gemini-1.5-flash-latest。",
      hintOpenRouter: "必需。例如: openai/gpt-4o。",
    }
  };

  // Function to apply localization to the popup
  function applyLocalization(lang) {
    console.log(`Popup: Applying localization for language: ${lang}`);
    const translations = i18nStrings[lang] || i18nStrings.en;
    document.querySelectorAll('[data-i18n-key]').forEach(element => {
      const key = element.getAttribute('data-i18n-key');
      if (translations[key]) {
        // For options, add "(Default)" or "(默认)" if it's the balanced style
        if (element.tagName === 'OPTION' && key === 'styleBalanced') {
            element.textContent = translations[key] + (lang === 'zh' ? " (默认)" : " (Default)");
        } else {
            element.textContent = translations[key];
        }
      } else {
        console.warn(`Popup: Missing i18n key "${key}" for lang "${lang}"`);
      }
    });
    // Update placeholders and hints which are managed directly
    updateModelPlaceholderAndHint(apiProviderSelect.value, lang);
    // Update API Key placeholder (not using data-i18n-key for this one)
    if (apiKeyInput) {
        apiKeyInput.placeholder = lang === 'zh' ? '输入您的 API 密钥' : 'Enter your API Key';
    } else {
        console.error("Popup: apiKeyInput element not found during localization.");
    }
  }

  // Load saved settings from chrome.storage.sync
  console.log("Popup: Attempting to load settings from chrome.storage.sync...");
  chrome.storage.sync.get(['uiLanguage', 'defaultRefinementStyle', 'apiProvider', 'apiKey', 'apiModel'], function(result) {
    if (chrome.runtime.lastError) {
        console.error("Popup: Error loading settings:", chrome.runtime.lastError);
        statusElement.textContent = "Error loading settings."; // Basic non-localized error
        statusElement.classList.add('error', 'visible');
        // Attempt to apply localization with defaults even if loading failed for some settings
        applyLocalization(uiLanguageSelect.value || 'en'); 
        return;
    }
    console.log("Popup: Settings loaded:", result);
    const currentLang = result.uiLanguage || 'en';
    uiLanguageSelect.value = currentLang;
    defaultRefinementStyleSelect.value = result.defaultRefinementStyle || 'balanced';
    apiProviderSelect.value = result.apiProvider || 'openai';
    if (result.apiKey) apiKeyInput.value = result.apiKey;
    if (result.apiModel) apiModelInput.value = result.apiModel;
    
    applyLocalization(currentLang);
  });

  // Event listeners
  if(uiLanguageSelect) {
    uiLanguageSelect.addEventListener('change', (event) => {
        console.log(`Popup: UI Language changed to: ${event.target.value}`);
        applyLocalization(event.target.value);
    });
  } else {
    console.error("Popup: uiLanguageSelect element not found.");
  }

  if(apiProviderSelect) {
    apiProviderSelect.addEventListener('change', () => {
        console.log(`Popup: API Provider changed to: ${apiProviderSelect.value}`);
        applyLocalization(uiLanguageSelect.value); // Re-apply localization to update dependent texts like hints
    });
  } else {
    console.error("Popup: apiProviderSelect element not found.");
  }


  function updateModelPlaceholderAndHint(provider, lang) {
    const translations = i18nStrings[lang] || i18nStrings.en;
    let placeholderText = translations.placeholderDefault;
    let hintText = "";

    switch (provider) {
      case 'openai':
        placeholderText = translations.placeholderOpenAI;
        hintText = translations.hintOpenAI;
        break;
      case 'deepseek':
        placeholderText = translations.placeholderDeepSeek;
        hintText = translations.hintDeepSeek;
        break;
      case 'anthropic':
        placeholderText = translations.placeholderAnthropic;
        hintText = translations.hintAnthropic;
        break;
      case 'google':
        placeholderText = translations.placeholderGoogle;
        hintText = translations.hintGoogle;
        break;
      case 'openrouter':
        placeholderText = translations.placeholderOpenRouter;
        hintText = translations.hintOpenRouter;
        break;
    }
    if(apiModelInput) {
        apiModelInput.placeholder = placeholderText;
    } else {
        console.error("Popup: apiModelInput element not found during placeholder update.");
    }
    if(modelHintElement) {
        modelHintElement.textContent = hintText;
        modelHintElement.style.display = hintText ? 'block' : 'none';
    } else {
        console.error("Popup: modelHintElement element not found during hint update.");
    }
  }

  if(saveButton) {
    saveButton.addEventListener('click', function() {
        console.log("Popup: Save button clicked.");
        const language = uiLanguageSelect.value;
        const defaultStyle = defaultRefinementStyleSelect.value;
        const provider = apiProviderSelect.value;
        const apiKey = apiKeyInput.value.trim();
        const apiModel = apiModelInput.value.trim();
        const translations = i18nStrings[language] || i18nStrings.en;

        statusElement.textContent = '';
        statusElement.className = 'status-message'; // Reset class, remove 'visible'

        if (!apiKey) {
        console.warn("Popup: API Key is missing.");
        statusElement.textContent = translations.statusApiKeyNeeded;
        statusElement.classList.add('error', 'visible');
        return;
        }
        if (provider === 'openrouter' && !apiModel) {
        console.warn("Popup: Model name missing for OpenRouter.");
        statusElement.textContent = translations.statusModelNameNeededOpenRouter;
        statusElement.classList.add('error', 'visible');
        return;
        }

        const settingsToSave = {
            uiLanguage: language,
            defaultRefinementStyle: defaultStyle,
            apiProvider: provider,
            apiKey: apiKey,
            apiModel: apiModel
        };
        console.log("Popup: Attempting to save settings:", settingsToSave);

        chrome.storage.sync.set(settingsToSave, function() {
        if (chrome.runtime.lastError) {
            console.error("Popup: Error saving settings:", chrome.runtime.lastError);
            statusElement.textContent = `Error saving: ${chrome.runtime.lastError.message}`; // Dev-facing error
            statusElement.classList.add('error', 'visible');
            return;
        }
        console.log("Popup: Settings saved successfully.");
        statusElement.textContent = translations.statusSettingsSaved;
        statusElement.classList.add('success', 'visible');
        setTimeout(() => { 
            statusElement.textContent = '';
            statusElement.className = 'status-message'; 
        }, 3000);
        });
    });
  } else {
    console.error("Popup: saveButton element not found.");
  }
  console.log("Popup: Event listeners attached and initial setup complete.");
});
