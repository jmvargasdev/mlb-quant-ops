const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { chat, vision, extractStructured, isAvailable, MODELS } = require('../../config/ollama');

async function extractFromUrl({ url, prompt, schema, selector, waitFor, useVision = false }) {
  const available = await isAvailable();
  if (!available) throw new Error('Ollama is not running — start with: brew services start ollama');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    if (waitFor) await page.waitForSelector(waitFor, { timeout: 10000 }).catch(() => {});

    // DOM path — fast, deterministic
    if (!useVision && selector) {
      const text = await page.locator(selector).allTextContents().catch(() => []);
      if (text.length) {
        const result = await extractStructured(
          MODELS.fast,
          `Extract structured data from this text:\n\n${text.join('\n')}\n\n${prompt}`,
          schema,
        );
        return { source: 'dom', url, data: result };
      }
    }

    // Vision path — for charts, dashboards, canvas-rendered content
    const buffer = await page.screenshot({ type: 'png', fullPage: false });
    const imageBase64 = buffer.toString('base64');
    const visionPrompt = `${prompt}\n\nRespond with valid JSON only matching this schema: ${JSON.stringify(schema)}`;
    const raw = await vision(MODELS.vision, imageBase64, visionPrompt);
    const match = raw.match(/\{[\s\S]*\}/);
    return { source: 'vision', url, data: match ? JSON.parse(match[0]) : null };
  } finally {
    await browser.close();
  }
}

async function extractFromScreenshot(imagePath, prompt, schema) {
  const available = await isAvailable();
  if (!available) throw new Error('Ollama is not running');
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const raw = await vision(
    MODELS.vision,
    imageBase64,
    `${prompt}\n\nRespond with valid JSON only matching this schema: ${JSON.stringify(schema)}`,
  );
  const match = raw.match(/\{[\s\S]*\}/);
  return match ? JSON.parse(match[0]) : null;
}

async function analyzeWithReason(prompt) {
  return chat(MODELS.reason, [
    { role: 'system', content: 'You are a quantitative market analyst. Be concise and precise. /no_think' },
    { role: 'user', content: prompt },
  ]);
}

async function analyzeWithMath(prompt) {
  return chat(MODELS.math, [
    { role: 'system', content: 'You are a quantitative risk analyst specializing in portfolio mathematics.' },
    { role: 'user', content: prompt },
  ]);
}

module.exports = { extractFromUrl, extractFromScreenshot, analyzeWithReason, analyzeWithMath };

if (require.main === module) {
  const [, , url, prompt] = process.argv;
  if (!url || !prompt) {
    console.error('Usage: node ollama_extract.js <url> "<prompt>"');
    process.exit(1);
  }
  extractFromUrl({ url, prompt, schema: { data: 'any' }, useVision: true })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((e) => { console.error(e.message); process.exit(1); });
}
