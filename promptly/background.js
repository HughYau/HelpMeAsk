// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhancePrompt") {
    const userPrompt = request.prompt;

    chrome.storage.sync.get(['apiProvider', 'apiKey', 'apiModel'], async (settings) => {
      const provider = settings.apiProvider || 'deepseek';
      const apiKey = settings.apiKey;
      let model = settings.apiModel;

      if (!apiKey) {
        sendResponse({ error: "API 密钥未设置。请在扩展程序的弹出窗口中进行设置。" });
        return true;
      }

      let apiUrl = '';
      let requestBody = {};
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };

      // Updated System Prompt: Emphasizes transforming input into a usable prompt.
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
Original input to refine into a prompt is: "${userPrompt}"`;


      if (provider === 'deepseek') {
        apiUrl = 'https://api.deepseek.com/v1/chat/completions';
        model = model || "deepseek-chat";
        requestBody = {
          model: model,
          messages: [
            // System prompt is now more direct and part of the user message for some models,
            // but for DeepSeek/OpenAI, a dedicated system message is standard.
            { "role": "system", "content": refiningSystemPrompt.split("\nOriginal input to refine into a prompt is:")[0].trim() }, // Send the main instruction as system
            { "role": "user", "content": userPrompt } // Send the user's actual prompt as user content
          ],
          temperature: 0.6,
          max_tokens: 2048,
          stream: false
        };
      } else if (provider === 'openai') {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        model = model || "gpt-3.5-turbo";
        requestBody = {
          model: model,
          messages: [
            { "role": "system", "content": refiningSystemPrompt.split("\nOriginal input to refine into a prompt is:")[0].trim() },
            { "role": "user", "content": userPrompt }
          ],
          temperature: 0.6,
          max_tokens: 2048
        };
      } else {
        sendResponse({ error: "不支持的 API 服务商或未在 popup 中正确选择。" });
        return true;
      }

      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ message: "无法解析错误响应" }));
          console.error(`${provider} API 错误:`, response.status, errorData);
          let errorMessage = `API 请求失败: ${response.status} ${response.statusText}. `;
          if (errorData && errorData.error && errorData.error.message) {
            errorMessage += errorData.error.message;
          } else if (errorData && errorData.message) {
             errorMessage += errorData.message;
          }
          sendResponse({ error: errorMessage });
          return true;
        }

        const data = await response.json();
        let enhancedPrompt = null;

        if (data.choices && data.choices.length > 0 && data.choices[0].message && data.choices[0].message.content) {
            enhancedPrompt = data.choices[0].message.content.trim();
        }

        if (enhancedPrompt) {
          sendResponse({ enhancedPrompt: enhancedPrompt });
        } else {
          console.error("从 API 收到的响应结构无效:", data);
          sendResponse({ error: "从 API 收到的响应结构无效或内容为空。" });
        }

      } catch (error) {
        console.error(`调用 ${provider} API 时出错:`, error);
        sendResponse({ error: `网络或其他错误: ${error.message}` });
      }
      return true;
    });
    return true;
  }
});
