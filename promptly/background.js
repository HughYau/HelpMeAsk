// background.js (v9 - With Dynamic System Prompts based on Refinement Style)

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhancePrompt") {
    const userPrompt = request.prompt;
    // The refinementStyle is now sent directly from content.js
    const refinementStyle = request.refinementStyle || 'balanced'; // Default to 'balanced' if not provided

    // Get API settings and UI language from storage
    chrome.storage.sync.get(['apiProvider', 'apiKey', 'apiModel', 'uiLanguage', 'defaultRefinementStyle'], async (settings) => {
      const provider = settings.apiProvider || 'openai';
      const apiKey = settings.apiKey;
      let model = settings.apiModel; // Model name from settings
      const language = settings.uiLanguage || 'en'; // UI language for error messages

      // Helper function to get localized strings
      const getStr = (key, lang, fallbackLang = 'en') => {
          const strings = {
              en: {
                  errorApiKeyMissing: "API Key is not set. Please set it in the extension popup.",
                  errorModelMissingOpenRouter: "Model name is required for OpenRouter. Please set it in the extension popup (e.g., 'openai/gpt-4o').",
                  errorUnsupportedProvider: "Unsupported API provider or not selected correctly in popup.",
                  errorApiRequestFailed: "API request failed",
                  errorApiResponseParse: "Could not parse error response from API.",
                  errorInvalidApiResponse: "Invalid API response structure or empty content received.",
                  errorNetworkOrOther: "Network or other error"
              },
              zh: {
                  errorApiKeyMissing: "API 密钥未设置。请在扩展程序的弹出窗口中进行设置。",
                  errorModelMissingOpenRouter: "OpenRouter 需要指定模型名称。请在扩展程序的弹出窗口中进行设置 (例如 'openai/gpt-4o')。",
                  errorUnsupportedProvider: "不支持的 API 服务商或未在 popup 中正确选择。",
                  errorApiRequestFailed: "API 请求失败",
                  errorApiResponseParse: "无法解析 API 的错误响应。",
                  errorInvalidApiResponse: "从 API 收到的响应结构无效或内容为空。",
                  errorNetworkOrOther: "网络或其他错误"
              }
          };
          return strings[lang]?.[key] || strings[fallbackLang]?.[key] || key;
      };

      // --- Validations ---
      if (!apiKey) {
        sendResponse({ error: getStr('errorApiKeyMissing', language) });
        return true; // Keep message channel open for async response
      }
      if (provider === 'openrouter' && !model) {
        sendResponse({ error: getStr('errorModelMissingOpenRouter', language) });
        return true;
      }

      // --- System Prompt Construction based on Refinement Style ---
      let baseSystemPrompt = `You are an expert prompt engineer. Your primary task is to transform the user's input into a clearer, more specific, and more effective prompt. This refined prompt is intended to be used as input for another large language model to generate a high-quality response.
Focus on:
1. Clarity: Ensure the prompt is unambiguous and easy for an LLM to understand.
2. Specificity: Add necessary details to narrow the scope and guide the LLM.
3. Actionability: Frame the prompt to request a concrete output or task.
4. Conciseness: Remove fluff or unnecessary parts, making it direct.
5. Completeness: Ensure all critical information for the LLM is present.
The user's original input might be in any language. Preserve the original language of the core request in your refined prompt.
IMPORTANT: Your entire response MUST be ONLY the refined prompt text. Do NOT include any conversational phrases, greetings, self-references, explanations of your changes, or any text other than the final, ready-to-use prompt.
If the original input is already an excellent or very short and clear prompt, you can return it as is or with very minimal, impactful adjustments.
The goal is to produce a prompt, not to answer the question or fulfill the request in the user's original input.`;

      let styleSpecificInstructions = "";
      switch (refinementStyle) {
          case 'subtle':
              styleSpecificInstructions = "Apply subtle enhancements. Focus on minor improvements to clarity, grammar, and flow while largely preserving the user's original phrasing and intent. Avoid significant rephrasing or adding new concepts unless absolutely necessary for basic coherence.";
              break;
          case 'creative':
              styleSpecificInstructions = "Adopt a creative approach. Expand on the user's ideas, suggest novel angles, or reframe the prompt in a more imaginative or comprehensive way. You can introduce related concepts or suggest a broader scope if it enhances the potential for a rich LLM response. Be bold but relevant.";
              break;
          case 'concise':
              styleSpecificInstructions = "Prioritize conciseness. Make the prompt as short and to-the-point as possible while retaining all critical information. Remove any redundancy, jargon (unless essential and common), and use precise, direct language. Aim for maximum clarity with minimum words.";
              break;
          case 'programming':
              styleSpecificInstructions = "Optimize the prompt specifically for generating or debugging code, or for discussing programming concepts. Ensure it includes relevant context like programming languages, frameworks, libraries, variable names, function signatures, error messages, or desired output format. Use technical terminology accurately and structure the prompt for easy parsing by an LLM focused on code.";
              break;
          case 'balanced': // Default style
          default:
              // The baseSystemPrompt already covers the balanced approach well.
              // We can add a slight emphasis here if needed, or leave it to the base.
              styleSpecificInstructions = "Strive for a balanced refinement, enhancing clarity, specificity, and actionability without drastically altering the original intent unless it's vague or poorly formed. Ensure the prompt is well-structured and guides the LLM effectively.";
              break;
      }

      const finalSystemPrompt = `${baseSystemPrompt}\n\nCURRENT REFINEMENT STYLE: "${refinementStyle}". ${styleSpecificInstructions}`;

      // --- API Configuration ---
      let apiUrl = '';
      let requestBody = {};
      const headers = { 'Content-Type': 'application/json' };

      switch (provider) {
        case 'openai':
          apiUrl = 'https://api.openai.com/v1/chat/completions';
          headers['Authorization'] = `Bearer ${apiKey}`;
          model = model || "gpt-3.5-turbo"; // Default OpenAI model
          requestBody = { model: model, messages: [{role: "system", content: finalSystemPrompt}, {role: "user", content: userPrompt}], temperature: 0.6, max_tokens: 2048 };
          break;
        case 'deepseek':
          apiUrl = 'https://api.deepseek.com/v1/chat/completions';
          headers['Authorization'] = `Bearer ${apiKey}`;
          model = model || "deepseek-chat"; // Default DeepSeek model
          requestBody = { model: model, messages: [{role: "system", content: finalSystemPrompt}, {role: "user", content: userPrompt}], temperature: 0.6, max_tokens: 2048, stream: false };
          break;
        case 'anthropic':
          apiUrl = 'https://api.anthropic.com/v1/messages';
          headers['x-api-key'] = apiKey;
          headers['anthropic-version'] = '2023-06-01';
          model = model || "claude-3-haiku-20240307"; // Default Anthropic model
          requestBody = { model: model, system: finalSystemPrompt, messages: [{role: "user", content: userPrompt}], max_tokens: 2048, temperature: 0.6 };
          break;
        case 'google':
          model = model || "gemini-1.5-flash-latest"; // Default Google model
          apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
          // Google's API structure is a bit different; combine system and user prompt for simpler integration here
          requestBody = {
            contents: [{ role: "user", parts: [{ text: finalSystemPrompt + "\n\nUser's original input to refine:\n" + userPrompt }] }],
            generationConfig: { temperature: 0.6, maxOutputTokens: 2048 }
          };
          break;
        case 'openrouter':
          apiUrl = 'https://openrouter.ai/api/v1/chat/completions';
          headers['Authorization'] = `Bearer ${apiKey}`;
          // Model is required and taken directly from user settings for OpenRouter (checked earlier)
          headers['HTTP-Referer'] = `chrome-extension://${chrome.runtime.id}`; 
          headers['X-Title'] = `Promptly Refiner Extension`; 
          requestBody = { model: model, messages: [{role: "system", content: finalSystemPrompt}, {role: "user", content: userPrompt}], temperature: 0.6, max_tokens: 2048 };
          break;
        default:
          sendResponse({ error: getStr('errorUnsupportedProvider', language) });
          return true;
      }

      // --- API Call ---
      try {
        console.log(`Background: Sending API request to ${provider} (${model}) with style "${refinementStyle}". Prompt: "${userPrompt.substring(0,50)}..."`);
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: getStr('errorApiResponseParse', language) }));
          console.error(`${provider} API Error:`, response.status, errorData);
          let errorMessage = `${getStr('errorApiRequestFailed', language)} (${response.status}): `;
          if (errorData?.error?.message) { 
            errorMessage += errorData.error.message;
          } else if (errorData?.message) { 
             errorMessage += errorData.message;
          } else {
            errorMessage += response.statusText; 
          }
          sendResponse({ error: errorMessage });
          return true;
        }

        const data = await response.json();
        let enhancedPrompt = null;

        // --- Response Parsing ---
        if (provider === 'openai' || provider === 'deepseek' || provider === 'openrouter') {
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
          console.log(`Background: Received enhanced prompt from ${provider}: "${enhancedPrompt.substring(0,100)}..."`);
          sendResponse({ enhancedPrompt: enhancedPrompt });
        } else {
          console.error("Invalid API response structure from " + provider + ":", data);
          sendResponse({ error: getStr('errorInvalidApiResponse', language) });
        }

      } catch (error) {
        console.error(`Error calling ${provider} API:`, error);
        sendResponse({ error: `${getStr('errorNetworkOrOther', language)}: ${error.message}` });
      }
      return true; // Keep message channel open for async response
    });
    return true; // Indicate that sendResponse will be called asynchronously
  }
});
