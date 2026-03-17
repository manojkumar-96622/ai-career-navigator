// frontend/app/emotionRules.ts

/**
 * Mappings of emotional states to exact tone instructions for the LLMs.
 * These instructions are injected into the context of every agent fired by the Orchestrator.
 */
export const emotionRules: Record<string, string> = {
  "FRUSTRATED": "Start your response with empathy. Use short calm sentences. Never use aggressive or technical language. Lead with understanding before giving any solution. Acknowledge that the situation feels unfair before moving forward.",

  "PANICKED": "Begin every response with reassurance. Tell the user that everything will be okay and that there are clear steps forward. Give all information in small numbered steps. Never overwhelm with too much at once. Keep a steady calm tone throughout.",

  "DISTRESSED": "MindSupportAgent must fire first before all other agents. Every agent must open with a gentle check-in asking if the user is okay. Use the softest possible language. Keep all responses short and warm. Never lead with facts or data — lead with human warmth first.",

  "CALM": "Respond professionally and thoroughly. Give full detailed structured answers. The user is composed and can handle complete information. Use clear headings and organised responses.",

  "EXCITED": "Match the positive energy of the user. Be enthusiastic and motivating. Use encouraging and empowering language throughout every response. Celebrate their willingness to take action.",

  "EXHAUSTED": "Use minimal text in every response. Give only the most important information and nothing extra. Use the simplest words possible. Be extremely gentle and supportive. Never give long paragraphs — use short bullet points only."
};
