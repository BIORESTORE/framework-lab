/**
 * OpenRouter — OpenAI-compatible Chat Completions via fetch (zero dependencies).
 * One key, hundreds of models. Slugs look like "openai/gpt-4o-mini",
 * "anthropic/claude-sonnet-4.5", "google/gemini-2.0-flash-001" — see
 * https://openrouter.ai/models. Pass a model per run to compare across models.
 */
export function openrouter(env = process.env, modelOverride) {
  const key = env.OPENROUTER_API_KEY;
  const model = modelOverride || env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  if (!key) throw new Error("OPENROUTER_API_KEY not set");
  // Optional attribution headers OpenRouter uses for its public rankings.
  const referer = env.OPENROUTER_SITE_URL || "https://github.com/framework-lab";
  const title = env.OPENROUTER_APP_NAME || "framework-lab";
  return {
    name: `openrouter:${model}`,
    async complete(prompt, { system, temperature = 0.7, maxTokens = 1200, model: callModel } = {}) {
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });
      const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "content-type": "application/json",
          "HTTP-Referer": referer,
          "X-Title": title
        },
        body: JSON.stringify({ model: callModel || model, temperature, max_tokens: maxTokens, messages })
      });
      if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return (data.choices?.[0]?.message?.content || "").trim();
    }
  };
}
