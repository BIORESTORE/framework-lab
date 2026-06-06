/** Anthropic Messages API via fetch — zero dependencies. */
export function anthropic(env = process.env, modelOverride) {
  const key = env.ANTHROPIC_API_KEY;
  const model = modelOverride || env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
  if (!key) throw new Error("ANTHROPIC_API_KEY not set");
  return {
    name: `anthropic:${model}`,
    async complete(prompt, { system, temperature = 0.7, maxTokens = 1200 } = {}) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json"
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          ...(system ? { system } : {}),
          messages: [{ role: "user", content: prompt }]
        })
      });
      if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      // Observed shape: { content: [{ type:"text", text:"..." }, ...] }
      return (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n").trim();
    }
  };
}
