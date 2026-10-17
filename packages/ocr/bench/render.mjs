// Render synthetic MRZ "document photos" with headless Chromium. Used by the OCR benchmark.
// Fonts come from the machine (default: DejaVu Sans Mono / any monospace); no font is bundled.
import { chromium } from 'playwright-core';

const EXECUTABLE =
  process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

export async function openRenderer() {
  const browser = await chromium.launch({ executablePath: EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  // Block every request: the page is rendered from a string only.
  await page.route('**/*', (route) => route.abort());
  return {
    /**
     * @param {string[]} lines MRZ lines
     * @param {{ rotate?: number, blur?: number, noise?: number, scale?: number, font?: string, seed?: number }} o
     */
    async render(lines, o = {}) {
      const width = lines[0].length > 40 ? 1250 : 880;
      const html = `<!doctype html><html><body style="margin:0;background:#888">
<div id="doc" style="position:absolute;left:40px;top:40px;width:${width}px;height:${Math.round(width * 0.68)}px;
 background:linear-gradient(135deg,#f4efe1,#e8eef4);transform:rotate(${o.rotate ?? 0}deg);filter:blur(${o.blur ?? 0}px);
 border-radius:14px;box-shadow:0 4px 20px #0006;overflow:hidden">
 <div style="position:absolute;left:40px;top:40px;font:bold 30px sans-serif;color:#335">SPECIMEN — SYNTHETIC</div>
 <div style="position:absolute;left:40px;top:100px;width:220px;height:280px;background:#c9d3dd"></div>
 <div style="position:absolute;left:300px;top:110px;font:20px sans-serif;color:#223;line-height:38px">
   Surname / Nom<br>Given names / Prénoms<br>Nationality<br>Date of birth<br>Date of expiry</div>
 <pre style="position:absolute;left:40px;bottom:36px;margin:0;font:${o.fontSize ?? 34}px ${o.font ?? "'DejaVu Sans Mono', monospace"};
  letter-spacing:${o.letterSpacing ?? 2}px;line-height:1.45;color:#111">${lines.join('\n').replace(/</g, '&lt;')}</pre>
</div></body></html>`;
      await page.setContent(html);
      const buf = await page.screenshot({ type: 'png', fullPage: true });
      return buf;
    },
    close: () => browser.close(),
  };
}
