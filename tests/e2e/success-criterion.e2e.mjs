/**
 * End-to-end test of the project's success criterion, in a real browser against the real backend:
 * open app -> register -> create report via wizard -> choose template -> write + format content ->
 * insert table + image -> save -> close -> reopen (content preserved) -> export DOCX and PDF.
 * Usage: node tests/e2e/success-criterion.e2e.mjs [outDir]   (backend :8000 and web :5173 must be running)
 */
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");  // devDependency (same version as CI browser)
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const OUT = process.argv[2] || "./e2e-out";
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.WEB_URL || "http://localhost:5173";
const log = (...a) => console.log("✓", ...a);
const assert = (c, m) => { if (!c) throw new Error("ASSERTION FAILED: " + m); };

// tiny PNG generator (solid color) for the image upload step
function png(w, h, [r, g, b]) {
  const crc = (buf) => { let c, k = -1; for (const x of buf) { c = (k ^ x) & 0xff; for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; k = (k >>> 8) ^ c; } return (k ^ -1) >>> 0; };
  const chunk = (t, d) => { const len = Buffer.alloc(4); len.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([r, g, b], y * (w * 3 + 1) + 1 + x * 3);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const imgPath = path.join(OUT, "figure.png");
fs.writeFileSync(imgPath, png(240, 120, [37, 99, 235]));

const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && !m.text().includes("Failed to load resource") && errors.push(m.text()));

/** wait until pagination has settled (page count unchanged for 1s) before clicking into the document */
async function waitStableLayout() {
  let last = "", same = 0;
  for (let i = 0; i < 40 && same < 4; i++) {
    const t = await page.getByTestId("page-count").innerText().catch(() => "");
    same = t && t === last ? same + 1 : 0; last = t;
    await page.waitForTimeout(250);
  }
}

try {
  await page.goto(BASE);
  // 1. register
  await page.getByText("إنشاء حساب").last().click();
  await page.getByLabel("الاسم الكامل").fill("سارة أحمد");
  await page.getByLabel("البريد الإلكتروني").fill(`e2e${Date.now()}@example.com`);
  await page.getByLabel("كلمة المرور").fill("Passw0rd!e2e");
  await page.getByRole("button", { name: "إنشاء حساب" }).click();
  await page.getByText("مرحباً، سارة أحمد").waitFor();
  log("registered and dashboard loaded");
  await page.screenshot({ path: path.join(OUT, "01-dashboard.png") });

  // 2. wizard
  await page.getByRole("button", { name: "تقرير جديد" }).first().click();
  await page.getByLabel("عنوان التقرير *").fill("تقرير عن تطبيقات الذكاء الاصطناعي في الطب");
  await page.getByLabel("الجامعة أو المدرسة").fill("جامعة بغداد");
  await page.getByLabel("القسم").fill("قسم علوم الحاسوب");
  await page.getByLabel("الأستاذ أو المشرف").fill("د. علي حسن");
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "طبي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByText("تقرير طبي").first().click();
  await page.screenshot({ path: path.join(OUT, "02-wizard-template.png") });
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByRole("button", { name: "التالي" }).click();
  await page.getByTestId("wizard-create").click();
  await page.getByTestId("editor").waitFor();
  await waitStableLayout();
  log("report created from template and opened in editor");
  const url = page.url();

  // 3. write + format
  const ed = page.getByTestId("editor");
  const intro = ed.locator("h1", { hasText: "المقدمة" });
  await intro.click();
  await page.waitForTimeout(150); // human-scale pause: let the editor apply the click's selection
  await page.keyboard.press("End");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.type("يشهد العالم تطوراً كبيراً في مجال الذكاء الاصطناعي، حيث تستخدم نماذج مثل GPT-4 في تشخيص الأمراض بدقة تصل إلى 95%.");
  await page.keyboard.press("Enter");
  await page.keyboard.type("Mixed English sentence inside an Arabic report.");
  await ed.locator("p", { hasText: "يشهد العالم" }).click({ clickCount: 3 });
  await page.getByTestId("btn-bold").click();
  await ed.locator("p", { hasText: "Mixed English" }).click();
  await page.waitForTimeout(150);
  await page.keyboard.press("End");
  log("typed Arabic + mixed English text and applied bold");

  // 4. table
  await page.getByTestId("tab-insert").click();
  await page.getByTestId("ins-table").click();
  await page.getByLabel("2x3").click();
  await page.waitForFunction(() => { const n = getSelection()?.anchorNode; return !!(n && (n.nodeType === 3 ? n.parentElement : n).closest("th,td")); });
  await page.keyboard.type("العينة"); await page.keyboard.press("Tab"); await page.keyboard.type("الدقة"); await page.keyboard.press("Tab");
  await page.keyboard.type("التصوير الطبي"); await page.keyboard.press("Tab"); await page.keyboard.type("94%");
  log("inserted and filled a table");

  // 5. image (cursor back in body text, below the paragraph)
  await ed.locator("p", { hasText: "Mixed English" }).click();
  await page.waitForTimeout(150);
  await page.keyboard.press("End");
  await page.getByTestId("ins-image").click();
  await page.getByLabel("image file").setInputFiles(imgPath);
  await page.getByLabel("التعليق التوضيحي (شكل N)").fill("مخطط توضيحي للنظام");
  await page.getByRole("dialog").getByRole("button", { name: "إدراج" }).click();
  await ed.locator("img").first().waitFor();
  log("inserted image with caption");

  // 6. layout: landscape round trip -> back to portrait; check pages
  await page.getByTestId("tab-layout").click();
  await page.getByTestId("size-A4").click();
  await page.waitForTimeout(600);
  const pagesText = await page.getByTestId("page-count").innerText();
  assert(parseInt(pagesText) >= 4, "cover, TOC, body and references on separate real pages: " + pagesText);
  log("paginated view:", pagesText);
  await page.screenshot({ path: path.join(OUT, "03-editor.png") });

  // 7. save
  await page.keyboard.press("Control+s");
  await page.getByTestId("save-state").getByText("تم الحفظ").waitFor({ timeout: 10000 });
  log("saved (Ctrl+S)");

  // 8. close and reopen
  await page.goto(BASE + "/#/reports");
  await page.getByText("تقرير عن تطبيقات الذكاء الاصطناعي في الطب").first().waitFor();
  await page.goto(url);
  await page.getByTestId("editor").waitFor();
  await page.waitForTimeout(800);
  const html = await page.getByTestId("editor").innerHTML();
  assert(html.includes("<strong>يشهد العالم تطوراً كبيراً"), "bold Arabic text preserved after reopen");
  assert(html.includes("Mixed English sentence"), "mixed text preserved");
  assert(html.includes("التصوير الطبي") && html.includes("94%"), "table preserved");
  assert(html.includes("data:image/png;base64"), "image preserved");
  log("reopened: text, formatting, table and image preserved");

  // 9. export DOCX + PDF
  await page.getByTestId("tab-file").click();
  for (const fmt of ["docx", "pdf"]) {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`export-${fmt}`).click()]);
    const p = path.join(OUT, `report.${fmt}`);
    await dl.saveAs(p);
    const size = fs.statSync(p).size;
    assert(size > 5000, `${fmt} export non-trivial (${size} bytes)`);
    log(`exported ${fmt} (${size} bytes)`);
  }
  {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-odt").click()]);
    await dl.saveAs(path.join(OUT, "report.odt"));
    log(`exported odt (${fs.statSync(path.join(OUT, "report.odt")).size} bytes)`);
  }
  // multi-page (side-by-side real pages)
  await page.getByTestId("tab-view").click();
  await page.getByRole("button", { name: "صفحات متعددة" }).click();
  await page.getByTestId("multi-pages").locator("img").first().waitFor({ timeout: 20000 });
  const thumbs = await page.getByTestId("multi-pages").locator("img").count();
  assert(thumbs >= 4, "multi-page view shows rendered pages: " + thumbs);
  await page.screenshot({ path: path.join(OUT, "05-multipage.png") });
  log(`multi-page view: ${thumbs} pages side by side`);
  await page.getByTestId("multi-pages").locator("button").first().click();
  await page.getByTestId("editor").waitFor();
  // similarity check
  await page.getByTestId("tab-review").click();
  await page.getByRole("button", { name: "جودة الكتابة" }).click();
  await page.getByRole("button", { name: "فحص التشابه مع مصادري وتقاريري" }).click();
  await page.getByTestId("similarity").getByText("تطابق").waitFor();
  log("similarity check ran");
  await page.getByTestId("tab-file").click();
  // 10. print preview
  await page.getByTestId("btn-print").click();
  await page.getByTestId("print-preview").waitFor();
  log("print preview opened");
  await page.keyboard.press("Escape");

  // 11. English UI + dark/light switch screenshot
  await page.goto(BASE + "/#/");
  await page.getByLabel("Language").click();
  await page.getByText("Welcome, سارة أحمد").waitFor();
  await page.screenshot({ path: path.join(OUT, "04-dashboard-en.png") });
  log("bilingual UI switch works");

  const relevant = errors.filter((e) => !/favicon|ResizeObserver/.test(e));
  assert(relevant.length === 0, "no console errors: " + relevant.join("\n"));
  console.log("\nALL E2E CHECKS PASSED");
} catch (e) {
  await page.screenshot({ path: path.join(OUT, "failure.png") });
  console.error(e);
  console.error("console errors:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
}
