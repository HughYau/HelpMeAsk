// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhancePrompt") {
    const userPrompt = request.prompt;

    chrome.storage.sync.get(['apiProvider', 'apiKey', 'apiModel', 'uiLanguage'], async (settings) => {
      const provider = settings.apiProvider || 'openai'; // Default to OpenAI if not set
      const apiKey = settings.apiKey;
      let model = settings.apiModel;
      const language = settings.uiLanguage || 'en'; // For error messages

      const getStr = (key, lang, fallbackLang = 'en') => {
          const strings = {
              en: {
                  errorApiKeyMissing: "API Key is not set. Please set it in the extension popup.",
                  errorUnsupportedProvider: "Unsupported API provider or not selected correctly in popup.",
                  errorApiRequestFailed: "API request failed",
                  errorApiResponseParse: "Could not parse error response from API.",
                  errorInvalidApiResponse: "Invalid API response structure or empty content received.",
                  errorNetworkOrOther: "Network or other error"
              },
              zh: {
                  errorApiKeyMissing: "API 密钥未设置。请在扩展程序的弹出窗口中进行设置。",
                  errorUnsupportedProvider: "不支持的 API 服务商或未在 popup 中正确选择。",
                  errorApiRequestFailed: "API 请求失败",
                  errorApiResponseParse: "无法解析 API 的错误响应。",
                  errorInvalidApiResponse: "从 API 收到的响应结构无效或内容为空。",
                  errorNetworkOrOther: "网络或其他错误"
              }
          };
          return strings[lang]?.[key] || strings[fallbackLang]?.[key] || key;
      };

      if (!apiKey) {
        sendResponse({ error: getStr('errorApiKeyMissing', language) });
        return true;
      }

      let apiUrl = '';
      let requestBody = {};
      const headers = { 'Content-Type': 'application/json' };

      // System prompt remains in English for best LLM results
      const refiningSystemPrompt = `You are an expert prompt engineer. Your primary task is to transform the user's input into a clearer, more specific, and more effective prompt. This refined prompt is intended to be used as input for another large language model to generate a high-quality response.
Focus on:
1. Clarity: Ensure the prompt is unambiguous and easy for an LLM to understand.
2. Specificity: Add necessary details to narrow the scope and guide the LLM.
3. Actionability: Frame the prompt to request a concrete output or task.
4. Conciseness: Remove fluff or unnecessary parts, making it direct.
5. Completeness: Ensure all critical information for the LLM is present.
The user's original input might be in any language. Preserve the original language of the core request in your refined prompt.
IMPORTANT: Your entire response MUST be ONLY the refined prompt text. Do NOT include any conversational phrases, greetings, self-references, explanations of your changes, or any text other than the final, ready-to-use prompt.
If the original input is already an excellent or very short and clear prompt, you can return it as is or with very minimal, impactful adjustments.
The goal is to produce a prompt, not to answer the question or fulfill the request in the user's original input.
Original input to refine into a prompt is: "${userPrompt}"`; // User prompt is illustrative here, actual prompt is passed in messages.

      switch (provider) {
        case 'openai':
          apiUrl = 'https://api.openai.com/v1/chat/completions';
          headers['Authorization'] = `Bearer ${apiKey}`;
          model = model || "gpt-3.5-turbo"; // OpenAI default
          requestBody = {
            model: model,
            messages: [
              { "role": "system", "content": refiningSystemPrompt.split("\nOriginal input to refine into a prompt is:")[0].trim() },
              { "role": "user", "content": userPrompt }
            ],
            temperature: 0.6, max_tokens: 2048
          };
          break;
        case 'deepseek':
          apiUrl = 'https://api.deepseek.com/v1/chat/completions';
          headers['Authorization'] = `Bearer ${apiKey}`;
          model = model || "deepseek-chat"; // DeepSeek default
          requestBody = {
            model: model,
            messages: [
              { "role": "system", "content": refiningSystemPrompt.split("\nOriginal input to refine into a prompt is:")[0].trim() },
              { "role": "user", "content": userPrompt }
            ],
            temperature: 0.6, max_tokens: 2048, stream: false
          };
          break;
        case 'anthropic':
          apiUrl = 'https://api.anthropic.com/v1/messages';
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          model = model || "claude-3-haiku-20240307"; // Anthropic default (Haiku is fast and cheap)
          requestBody = {
            model: model,
            system: refiningSystemPrompt.split("\nOriginal input to refine into a prompt is:")[0].trim(),
            messages: [{ "role": "user", "content": userPrompt }],
            max_tokens: 2048, temperature: 0.6
          };
          break;
        case 'google':
          // Note: Gemini API uses a different structure. The key is appended to the URL.
          // The model name in the URL should be like 'gemini-1.5-flash-latest' or 'gemini-pro'
          model = model || "gemini-1.5-flash-latest"; // Google default
          apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          // Gemini's system instruction handling is a bit different.
          // It can be part of the 'contents' or a separate 'system_instruction'.
          // For simplicity and broad compatibility, we'll include it as the first part of the user's content.
          requestBody = {
            contents: [
              {
                role: "user",
                parts: [
                  // System prompt first, then user prompt
                  { text: refiningSystemPrompt.split("\nOriginal input to refine into a prompt is:")[0].trim() + "\n\nRefine the following user input into a prompt:\n" + userPrompt }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.6,
              maxOutputTokens: 2048
            }
          };
          break;
        default:
          sendResponse({ error: getStr('errorUnsupportedProvider', language) });
          return true;
      }

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: getStr('errorApiResponseParse', language) }));
          console.error(`${provider} API Error:`, response.status, errorData);
          let errorMessage = `${getStr('errorApiRequestFailed', language)}: ${response.status} ${response.statusText}. `;
          if (provider === 'anthropic' && errorData.error && errorData.error.message) {
            errorMessage += errorData.error.message; // Anthropic error structure
          } else if (provider === 'google' && errorData.error && errorData.error.message) {
            errorMessage += errorData.error.message; // Google error structure
          } else if (errorData && errorData.error && errorData.error.message) { // OpenAI style
            errorMessage += errorData.error.message;
          } else if (errorData && errorData.message) { // DeepSeek or other generic
             errorMessage += errorData.message;
          }
          sendResponse({ error: errorMessage });
          return true;
        }

        const data = await response.json();
        let enhancedPrompt = null;

        if (provider === 'openai' || provider === 'deepseek') {
          if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            enhancedPrompt = data.choices[0].message.content.trim();
          }
        } else if (provider === 'anthropic') {
          if (data.content && data.content.length > 0 && data.content[0].type === "text") {
            enhancedPrompt = data.content[0].text.trim();
          }
        } else if (provider === 'google') {
          if (data.candidates && data.candidates.length > 0 &&
              data.candidates[0].content && data.candidates[0].content.parts &&
              data.candidates[0].content.parts.length > 0 && data.candidates[0].content.parts[0].text) {
            enhancedPrompt = data.candidates[0].content.parts[0].text.trim();
          }
        }

        if (enhancedPrompt) {
          sendResponse({ enhancedPrompt: enhancedPrompt });
        } else {
          console.error("Invalid API response structure from " + provider + ":", data);
          sendResponse({ error: getStr('errorInvalidApiResponse', language) });
        }

      } catch (error) {
        console.error(`Error calling ${provider} API:`, error);
        sendResponse({ error: `${getStr('errorNetworkOrOther', language)}: ${error.message}` });
      }
      return true; // Indicates asynchronous response
    });
    return true; // Indicates asynchronous response
  }
});
