import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require('C:/Users/Asus/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser = await chromium.launch({ executablePath: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', headless: true });
const out = new URL('../.local/screens/', import.meta.url);
await mkdir(out, { recursive: true });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
page.on('pageerror', error => errors.push(error.message));
const screens = [
  ['overview', 'Evidence at a glance'], ['experiments', 'Four treatments. Twelve units.'],
  ['solar', 'Output under observation'], ['coating', 'Which treatment led the observed result?'],
  ['greenhouse', 'Greenhouse conditions'], ['log', 'The measurement record'], ['system', 'System integrity'],
];
for (const [section, heading] of screens) {
  await page.goto(`http://127.0.0.1:5173/#/${section}`, { waitUntil: 'networkidle' });
  await page.getByRole('heading', { name: heading }).waitFor({ timeout: 10000 });
  await page.screenshot({ path: fileURLToPath(new URL(`${section}.png`, out)), fullPage: true });
  console.log(`${section}: heading visible`);
}
await page.goto('http://127.0.0.1:5173/#/log', { waitUntil: 'networkidle' });
await page.getByText('12,34', { exact: true }).first().waitFor();
await page.reload({ waitUntil: 'networkidle' });
await page.getByText('12,34', { exact: true }).first().waitFor();
console.log('PostgreSQL-inserted measurement remains visible after browser refresh');
await page.goto('http://127.0.0.1:5173/#/greenhouse', { waitUntil: 'networkidle' });
await page.getByText('29,4°C', { exact: true }).first().waitFor();
console.log('PostgreSQL-inserted greenhouse reading visible');
const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
mobile.on('pageerror', error => errors.push(error.message));
for (const [section, heading] of screens) {
  await mobile.goto(`http://127.0.0.1:5173/#/${section}`, { waitUntil: 'networkidle' });
  await mobile.getByRole('heading', { name: heading }).waitFor({ timeout: 10000 });
  await mobile.screenshot({ path: fileURLToPath(new URL(`${section}-mobile.png`, out)), fullPage: true });
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (overflow) throw new Error(`${section} mobile viewport has horizontal page overflow`);
  console.log(`${section} mobile: heading visible, no page overflow`);
}
if (errors.length) throw new Error(`Browser errors: ${errors.join(' | ')}`);
await browser.close();
console.log('Seven desktop and mobile screens rendered without page errors.');

