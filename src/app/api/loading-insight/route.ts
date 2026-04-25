import { NextResponse } from "next/server";

import { resolveMarketSession, type SessionKey } from "@/lib/time";

export const dynamic = "force-dynamic";

// ── Response schema ───────────────────────────────────────────
export type InsightSource = "gemini" | "local";

export type LoadingInsightResponse = {
  insights: string[];   // 6 items: Trend, Liquidity, Risk, Strategy, News, Price Action (2-3 Thai sentences each)
  source: InsightSource;
};

// ── Gemini config ─────────────────────────────────────────────
const GEMINI_MODEL = process.env.GEMINI_LOADING_MODEL ?? "gemini-2.5-flash-preview-09-2025";
const REQUEST_TIMEOUT_MS = 6000;

// ── Server-side cache ────────────────────────────────────────
const SERVER_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
type ServerCache = { data: LoadingInsightResponse; session: SessionKey; timestamp: number };
let serverCache: ServerCache | null = null;

// ── Local fallback bank — 2-3 Thai sentences per topic ────────
// Each entry = [Trend, Liquidity, Risk, Strategy, News, PriceAction]
const LOCAL_INSIGHTS: Record<SessionKey, string[][]> = {
  asia: [
    [
      "โครงสร้างระยะสั้นยังเอนเอียงฝั่งบน higher low ล่าสุดยังคงสมบูรณ์ ราคาทรงตัวเหนือ EMA สำคัญในกรอบเอเชีย",
      "สภาพคล่องสะสมใต้ swing low ล่าสุดยังไม่ถูกเก็บ ความเสี่ยง liquidity sweep ก่อนขึ้นต่อยังมีนัยสำคัญ ควรระวังการหลุดฐานระยะสั้น",
      "โซน supply เดิมระดับ H4 ยังไม่ถูก retest แรงขาย rejection ที่แนวต้านต้องติดตามใกล้ชิด หากยืนไม่ได้คือสัญญาณรอบใหม่",
      "รอ pullback เข้าโซน demand ก่อนเปิดไม้ตามแนวโน้มหลัก หลีกเลี่ยงซื้อในพื้นที่ premium ที่ราคาวิ่งออกไปแล้ว",
      "ตลาดเอเชียแกว่งกรอบแคบรอ catalyst จากยุโรป ยังไม่มีข่าวสำคัญที่เปลี่ยนทิศทางในช่วงเช้า",
      "ราคาทดสอบ premium zone ใน asia session พร้อม volume ที่ลดลง บ่งชี้แรงซื้อชะลอตัว ระวังการ fake breakout",
    ],
    [
      "Higher timeframe bullish structure ยังสมบูรณ์ pullback ตื้นผิดปกติสะท้อนว่า sellers ขาด conviction จริง ทิศทางหลักยังบวก",
      "Volume delta ช่วง NY สวนทาง price action บ่งชี้การดูดซับออเดอร์ขายเงียบๆ ซึ่งมักนำมาซึ่งการ squeeze ฝั่งขาขึ้น",
      "DXY ยังอ่อนตัวต่อเนื่อง real yield ลดลง เป็น headwind ฝั่งขาลงสำหรับ gold ในระยะกลาง",
      "เน้นหา buy setup ที่ discount zone หลัง pullback สะอาด ไม่ไล่ราคาในพื้นที่ที่ขึ้นมามากแล้ว",
      "ไม่มีข่าว USD สำคัญในช่วงเช้า ตลาดเคลื่อนไหวด้วย technical ล้วนๆ ให้น้ำหนักกับ price action",
      "รูปแบบ candle ล่าสุดแสดง absorption ที่ฐานรองรับ momentum อาจกลับมาฝั่งบวกในช่วงบ่าย",
    ],
  ],
  london: [
    [
      "London session เปิดด้วย momentum ต่อเนื่องจาก asia พร้อม order flow ฝั่งซื้อที่ชัดเจนขึ้น แนวโน้มระยะสั้นยังเป็นบวก",
      "Liquidity ฝั่งบนยังเปิดอยู่เป็น magnet ดึงดูดราคา โซน sweep เหนือ high ล่าสุดยังน่าจับตามอง",
      "โดน rejection แรงที่ supply zone คือสัญญาณเสี่ยงชัดเจน หากเกิดขึ้นให้รอ retest ก่อนตัดสินใจ",
      "เลือกเทรด continuation หลัง pullback เข้า demand zone ที่สะอาด รอ confirmation จาก price action ก่อนเปิดไม้",
      "ข้อมูลยุโรปออกมาผสมผสาน ไม่มีตัวเลขที่เปลี่ยน sentiment หลักได้ทันที ให้น้ำหนักกับ flow มากกว่าข่าว",
      "Break of structure ระดับ H4 ยังไม่มี retest สะอาด เปิดโอกาสเทรด continuation คุณภาพสูงในช่วงบ่าย",
    ],
    [
      "London momentum หนุน bias บวกต่อเนื่อง order flow สถาบันเริ่มเด่นชัดในช่วง European open ทิศทางยังไปได้",
      "Sweep ใต้ asia low เรียบร้อยแล้ว โครงสร้างพร้อมสำหรับ long กลับ liquidity ใต้ฐานถูกเก็บไปแล้ว",
      "Risk-off sentiment ยังคงเป็นปัจจัยหนุน gold ในระยะสั้น ให้ระวัง reversal เมื่อ DXY ดีดกลับ",
      "ใช้ London close เป็น reference level สำหรับ NY session รักษา bias เดิมจนกว่าจะเสียโครงสร้าง",
      "European data อ่อนแอกว่าคาด หนุน safe-haven demand แต่ไม่ถึงกับเปลี่ยนทิศทางหลักได้",
      "Price action ช่วง London แสดง controlled retracement บ่งชี้แรงซื้อที่มีโครงสร้าง ไม่ใช่การขายทิ้ง",
    ],
  ],
  ny: [
    [
      "NY open เปิดด้วย momentum ต่อเนื่องจาก London bias ยังคงเป็นบวก แต่ต้องระวัง reversal หลัง CPI data",
      "Liquidity ฝั่งบนถูกเก็บบางส่วนแล้ว อาจเกิด distribution ก่อนปิด session ระวังการ fade ที่ high",
      "US data สำคัญวันนี้อาจพลิก bias ทันที เตรียมแผนรับมือทั้งสองทิศทางและลดขนาดไม้ก่อนข่าว",
      "ถือ bias บวกจนกว่าจะเสียฐาน H1 อย่าสวนกระแสหลักโดยไม่มี confirmation ชัดเจน",
      "FOMC minutes และ Fed speakers เป็นปัจจัยหลักที่ตลาดจับตา ความผันผวนอาจเพิ่มสูงในช่วงนี้",
      "NY session มักเป็นช่วงที่สถาบันรีบาลานซ์ portfolio ราคาอาจแกว่งแรงก่อนหาทิศทางที่แท้จริง",
    ],
    [
      "DXY breakdown ยืนยันแล้ว gold มีแนวโน้มวิ่งต่อในทิศทางบวก correlation ยังทำงานปกติ",
      "Retail positioning net-short สูงผิดปกติ เป็น fuel สำหรับ short squeeze ขาขึ้นในระยะสั้น",
      "Bond yield ปรับตัวขึ้น เป็น headwind สำหรับ gold ต้องติดตามว่า price action จะชนะได้ไหม",
      "เทรดตาม institutional order flow อย่าสวนกระแสสถาบันโดยไม่มีเหตุผลที่แข็งแกร่งพอ",
      "FOMC แสดงท่าที dovish มากกว่าคาด เป็น bullish catalyst สำหรับ gold ในระยะกลาง",
      "NY session close เหนือ key resistance ระดับสัปดาห์จะยืนยัน weekly bias บวกได้อย่างสมบูรณ์",
    ],
  ],
  overnight: [
    [
      "ตลาดดึกสภาพคล่องบางมาก ราคาแกว่งในกรอบหลัง NY close โครงสร้างยังไม่เสียแต่ momentum ชะลอ",
      "โซน demand ระดับ daily ยังไม่ถูกทดสอบ อาจเป็นจุดที่ราคาวิ่งไปหาก่อนเปิดเซสชันถัดไป",
      "ระวัง gap risk ช่วงดึก ลดขนาดตำแหน่งค้างคืนและตั้ง stop ที่กว้างพอรับกับ thin liquidity",
      "รอ asia open เพื่อยืนยัน direction ที่ชัดเจนก่อนเปิดไม้ใหม่ อย่าตัดสินใจใหญ่ในช่วงที่ตลาดบาง",
      "ไม่มีข่าวสำคัญในช่วงดึก ตลาดเคลื่อนไหวด้วย technical และ thin order book เป็นหลัก",
      "Overnight range จะเป็น reference level สำคัญสำหรับ asia session ในวันถัดไป จับตา high-low ของคืนนี้",
    ],
  ],
};

function pickDeterministic<T>(list: T[], seed: number, salt: number): T {
  const index = Math.abs(Math.floor(seed * 9301 + salt * 49297)) % list.length;
  return list[index]!;
}

function composeLocalResponse(now = new Date()): LoadingInsightResponse {
  const session = resolveMarketSession(now);
  const rotation = Math.floor(now.getTime() / (10 * 60 * 1000));
  const jitter = (rotation % 997) / 997;

  const bank = LOCAL_INSIGHTS[session];
  const insights = pickDeterministic(bank, jitter, 1);

  return { insights, source: "local" };
}

// ── Gemini fetch ──────────────────────────────────────────────
type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
};

function stripMarkdown(s: string): string {
  return s
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/#/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

async function generateWithGemini(apiKey: string): Promise<LoadingInsightResponse | null> {
  const now = new Date();
  const session = resolveMarketSession(now);
  const controller = new AbortController();
  const tid = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const systemPrompt = `คุณคือ AI วิเคราะห์ตลาด XAUUSD ระดับสถาบัน ตอบเฉพาะภาษาไทย กระชับ คม ไม่มี markdown ไม่มี bullet ไม่มี emoji

ให้ output เป็น JSON เท่านั้น:
{
  "insights": [string, string, string, string, string, string]
}

insights คือ array 6 ประโยค ครอบคลุมหัวข้อตามลำดับ:
0: Trend — ทิศทางหลักและโครงสร้างตลาด (2-3 ประโยค รวมเป็น string เดียว)
1: Liquidity — สภาพคล่องและโซน sweep (2-3 ประโยค)
2: Risk — ความเสี่ยงและจุดที่ต้องระวัง (2-3 ประโยค)
3: Strategy — กลยุทธ์การเทรด (2-3 ประโยค)
4: News — ข่าวและ fundamental ที่กระทบ (2-3 ประโยค)
5: Price Action — สัญญาณ price action และ candle pattern (2-3 ประโยค)

แต่ละ string คือ 2-3 ประโยคต่อเนื่องกัน ไม่มีขึ้นบรรทัดใหม่ในระหว่างประโยค`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: `วิเคราะห์ตลาด XAUUSD ณ ${now.toISOString()} ครอบคลุม 6 มิติ โดยยึดบริบท session ปัจจุบันเป็น ${session}` }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          ...(process.env.AI_INSIGHT_GROUNDING === "on" ? { tools: [{ googleSearch: {} }] } : {}),
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.65,
            maxOutputTokens: 1200,
          },
        }),
      },
    );

    clearTimeout(tid);
    if (!res.ok) return null;

    const payload = (await res.json().catch(() => null)) as GeminiResponse | null;
    const raw = payload?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;

    let parsed: unknown;
    try {
      const cleaned = raw.replace(/^```(?:json)?\n?/i, "").replace(/\n?```$/i, "").trim();
      parsed = JSON.parse(cleaned);
    } catch { return null; }

    if (typeof parsed !== "object" || parsed === null || !("insights" in parsed)) return null;

    const p = parsed as Record<string, unknown>;
    const insights = Array.isArray(p.insights)
      ? (p.insights as unknown[]).filter((x): x is string => typeof x === "string").map(stripMarkdown).slice(0, 6)
      : [];

    if (insights.length < 6) return null;
    return { insights, source: "gemini" };
  } catch {
    clearTimeout(tid);
    return null;
  }
}

// ── Handler ───────────────────────────────────────────────────
function jsonResponse(payload: LoadingInsightResponse, cacheHit: boolean) {
  const res = NextResponse.json(payload);
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.headers.set("X-Insight-Cache", cacheHit ? "hit" : "miss");
  return res;
}

export async function GET() {
  const now = new Date();
  const currentSession = resolveMarketSession(now);

  // Check server-side cache
  if (
    serverCache &&
    serverCache.session === currentSession &&
    now.getTime() - serverCache.timestamp < SERVER_CACHE_TTL_MS
  ) {
    return jsonResponse(serverCache.data, true);
  }

  const apiKey = process.env.GEMINI_API_KEY;
  const allowGemini = apiKey && process.env.AI_INSIGHT_PROVIDER !== "local";

  if (allowGemini) {
    const result = await generateWithGemini(apiKey);
    if (result) {
      serverCache = { data: result, session: currentSession, timestamp: now.getTime() };
      return jsonResponse(result, false);
    }
  }

  const local = composeLocalResponse();
  return jsonResponse(local, false);
}
