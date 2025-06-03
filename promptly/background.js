// background.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "enhancePrompt") {
    const userPrompt = request.prompt; // 这是用户在输入框输入的原始 prompt

    // 从存储中获取 API 设置
    chrome.storage.sync.get(['apiProvider', 'apiKey', 'apiModel'], async (settings) => {
      const provider = settings.apiProvider || 'deepseek'; // 默认使用 deepseek
      const apiKey = settings.apiKey;
      let model = settings.apiModel;

      if (!apiKey) {
        sendResponse({ error: "API 密钥未设置。请在扩展程序的弹出窗口中进行设置。" });
        return true; // 异步发送响应
      }

      let apiUrl = '';
      let requestBody = {};
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };

      // 这是发送给润色模型的系统指令。确保它是英文的，以获得最佳和最稳定的润色效果。
      // 指令的目标是让润色模型只返回优化后的 prompt 文本。
      const refiningSystemPrompt = `You are an expert prompt engineer. Your task is to refine the user's input to make it a clearer, more specific, and more effective prompt for eliciting a high-quality response from a large language model.
Focus on:
1. Clarity: Ensure the prompt is unambiguous.
2. Specificity: Add details if necessary to narrow down the scope.
3. Actionability: Make sure the prompt asks for a concrete output.
4. Conciseness: Remove any fluff or unnecessary parts.
5. Completeness: Ensure all necessary information is there.
The user's original prompt might be in any language. Preserve the original language of the prompt in your refined output.
Do NOT add any conversational fluff, greetings, self-references, or any text other than the refined prompt itself in your response.
If the original prompt is already excellent or very short and clear, you can return it as is or with very minimal, impactful adjustments.
Original prompt to refine is provided by the user.`;

      if (provider === 'deepseek') {
        apiUrl = 'https://api.deepseek.com/v1/chat/completions'; // DeepSeek API v1 endpoint
        model = model || "deepseek-chat"; // DeepSeek 默认模型示例
        requestBody = {
          model: model,
          messages: [
            { "role": "system", "content": refiningSystemPrompt },
            { "role": "user", "content": userPrompt } // userPrompt 是用户输入的内容
          ],
          temperature: 0.6, // 可以调整以获得不同创造性的结果
          max_tokens: 2048, // 确保足够长以容纳润色后的 prompt
          stream: false // 我们需要一次性收到完整结果
        };
      } else if (provider === 'openai') {
        apiUrl = 'https://api.openai.com/v1/chat/completions';
        model = model || "gpt-3.5-turbo";
        requestBody = {
          model: model,
          messages: [
            { "role": "system", "content": refiningSystemPrompt },
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
          if (errorData && errorData.error && errorData.error.message) { // OpenAI style error
            errorMessage += errorData.error.message;
          } else if (errorData && errorData.message) { // DeepSeek style error or other
             errorMessage += errorData.message;
          }
          sendResponse({ error: errorMessage });
          return true;
        }

        const data = await response.json();
        let enhancedPrompt = null;

        // DeepSeek 和 OpenAI (Chat Completions) 的响应结构类似
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
      return true; // 必须返回 true 以表明 sendResponse 将被异步调用
    });
    return true; // 对于异步 sendResponse 至关重要
  }
});
