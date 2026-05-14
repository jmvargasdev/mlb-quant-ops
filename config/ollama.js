const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';

const MODELS = {
  fast:   process.env.OLLAMA_MODEL_FAST   || 'qwen3:8b',
  reason: process.env.OLLAMA_MODEL_REASON || 'qwen3:32b',
  math:   process.env.OLLAMA_MODEL_MATH   || 'deepseek-r1:32b',
  vision: process.env.OLLAMA_MODEL_VISION || 'llama3.2-vision:11b',
};

async function isAvailable() {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function listModels() {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
  const json = await res.json();
  return (json.models || []).map((m) => m.name);
}

async function chat(model, messages, options = {}) {
  const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false, ...options }),
  });
  if (!res.ok) throw new Error(`Ollama chat failed: ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

async function vision(model, imageBase64, prompt) {
  const res = await fetch(`${OLLAMA_BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${imageBase64}` } },
        ],
      }],
    }),
  });
  if (!res.ok) throw new Error(`Ollama vision failed: ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || '';
}

async function extractStructured(model, prompt, schema) {
  const systemPrompt = `You are a structured data extractor. Always respond with valid JSON only, no explanation. Schema: ${JSON.stringify(schema)}`;
  const content = await chat(model, [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: prompt },
  ]);
  try {
    const match = content.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : null;
  } catch {
    return null;
  }
}

module.exports = { OLLAMA_BASE_URL, MODELS, isAvailable, listModels, chat, vision, extractStructured };
