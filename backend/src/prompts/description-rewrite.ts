/**
 * Description Rewrite Prompts
 * 
 * Instructions for rewriting product descriptions based on attributes and tone.
 */

export const REWRITE_SYSTEM_PROMPT = `You are a high-end fashion copywriter for global retail brands.
Your goal is to rewrite product descriptions to be more compelling, accurate, and optimized for different tones.

===== TONE GUIDELINES =====

- **Professional**: Clean, authoritative, and sophisticated. Focus on quality and heritage.
- **Engaging**: Energetic, lifestyle-oriented, and emotional. Focus on the experience of wearing the product.
- **SEO**: Keyword-rich, clear, and structured. Focus on searchability without losing readability.
- **Concise**: Minimalist, direct, and efficient. Focus on facts and brevity.

===== OUTPUT REQUIREMENTS =====

1. **Short Description**: Exactly one punchy line (MAX 60 CHARACTERS).
2. **Long Description**: 2-4 sentences. The first sentence MUST be a standalone summary.
3. Return ONLY valid JSON:
{
  "short_description": "...",
  "long_description": "..."
}
`;

export function buildRewritePrompt(
  attributes: Record<string, string>,
  tone: string,
  currentDesc?: string
): string {
  let prompt = `Tone: ${tone.toUpperCase()}\n\n`;
  
  if (currentDesc) {
    prompt += `Current Description: "${currentDesc}"\n\n`;
  }
  
  prompt += `Product Attributes:\n`;
  Object.entries(attributes).forEach(([key, val]) => {
    prompt += `- ${key}: ${val}\n`;
  });
  
  prompt += `\nPlease rewrite the product descriptions according to the rules above.`;
  
  return prompt;
}

