/**
 * Offline deterministic provider. Lets tests + UI run with no API key.
 * Echoes recognizable structure so prompt-threading can be asserted.
 */
export function mock() {
  let n = 0;
  return {
    name: "mock",
    async complete(prompt) {
      n++;
      const head = prompt.split("\n").find(l => l.trim()) || "";
      if (/IMAGE PROMPT/i.test(prompt)) {
        return `APPROACH: [mock ${n}] Simulated approach for: ${head.slice(0, 60)}\nIMAGE PROMPT: [mock ${n}] cinematic test render of the concept, dramatic light --ar 16:9`;
      }
      return `[mock ${n}] response to: ${head.slice(0, 60)} ... FINAL ANSWER: mock-conclusion-${n}`;
    }
  };
}
