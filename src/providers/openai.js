/** OpenAI Chat Completions via fetch — zero dependencies. */
export function openai(env = process.env, modelOverride) {
  const key = env.OPENAI_API_KEY;
  const model = modelOverride || env.OPENAI_MODEL || "gpt-4o-mini";
  if (!key) throw new Error("OPENAI_API_KEY not set");
  return {
    name: `openai:${model}`,
    async complete(prompt, { system, temperature = 0.7, maxTokens = 1200 } = {}) {
      const messages = [];
      if (system) messages.push({ role: "system", content: system });
      messages.push({ role: "user", content: prompt });
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({ model, temperature, max_tokens: maxTokens, messages })
      });
      if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      return (data.choices?.[0]?.message?.content || "").trim();
    }
  };
}
