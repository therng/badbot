import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type InsightSource = "gemini" | "local" | "fallback";

type LoadingInsightResponse = {
  insight: string;
  source: InsightSource;
};

type GeminiGenerateContentResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
};

const FALLBACK_INSIGHT = "พร้อมสำหรับการวิเคราะห์ข้อมูลขั้นสูง";
const GEMINI_MODEL = process.env.GEMINI_LOADING_MODEL ?? "gemini-2.5-flash-preview-09-2025";
const REQUEST_TIMEOUT_MS = 2500;
const MAX_RETRIES = 2;

function json(payload: LoadingInsightResponse) {
  const response = NextResponse.json(payload);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  return response;
}

function normalizeInsight(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  let normalized = value.replace(/(\*\*|__)(.*?)\1/g, "$2");
  normalized = normalized.replace(/(\*|_)(.*?)\1/g, "$2");
  normalized = normalized.replace(/#/g, "");

  normalized = normalized.replace(/\s+/g, " ").trim();
  return normalized.length > 0 ? normalized : null;
}

async function fetchWithRetry(url: string, init: RequestInit, retries = MAX_RETRIES, backoff = 350): Promise<Response> {
  try {
    const response = await fetch(url, init);
    if (!response.ok && retries > 0) {
      await new Promise((resolve) => setTimeout(resolve, backoff));
      return fetchWithRetry(url, init, retries - 1, backoff * 2);
    }

    return response;
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, backoff));
    return fetchWithRetry(url, init, retries - 1, backoff * 2);
  }
}

// ─────────────────────────────────────────────────────────────
// Local insight composer — zero external API cost.
// Produces Thai XAUUSD-style insights by combining curated
// bias / structure / risk fragments. Time-of-day awareness uses
// Bangkok hour to pick the relevant trading session context.
// ─────────────────────────────────────────────────────────────

type SessionKey = "asia" | "london" | "ny" | "overnight";

function bangkokHour(date = new Date()) {
  // Bangkok = UTC+7, no DST
  const utc = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.floor(((utc + 7 * 60) % (24 * 60)) / 60);
}

function resolveSession(hour: number): SessionKey {
  if (hour >= 7 && hour < 14) return "asia";
  if (hour >= 14 && hour < 20) return "london";
  if (hour >= 20 || hour < 2) return "ny";
  return "overnight";
}

const BIAS_OPENERS: Record<SessionKey, string[]> = {
  asia: [
    "ช่วงเอเชียแรงซื้อเบาบางแต่โครงสร้างระยะสั้นยังเอนเอียงฝั่งบน",
    "ตลาดเอเชียเดินกรอบแคบพร้อมสะสมโมเมนตัมก่อนเซสชันยุโรป",
    "ราคาทองยังพักตัวเหนือแนวรับสำคัญในกรอบเอเชีย",
  ],
  london: [
    "ลอนดอนเปิดมาพร้อมการทดสอบสภาพคล่องฝั่งสูงอย่างมีนัย",
    "เซสชันยุโรปจังหวะการไหลของออเดอร์เริ่มเอนไปฝั่งผู้ซื้อ",
    "โมเมนตัมลอนดอนหนุนการ breakout กรอบเอเชียอย่างต่อเนื่อง",
  ],
  ny: [
    "เซสชันนิวยอร์กเปิดพร้อมแรงหนุนจากบอนด์ยิลด์ที่อ่อนตัว",
    "ช่วงนิวยอร์กมักเป็นช่วงที่สถาบันรีบาลานซ์พอร์ต liquidity จึงบางกว่าปกติ",
    "นิวยอร์กเข้ามาพร้อมโมเมนตัมต่อเนื่องจากลอนดอน ผู้ขายยังไม่สามารถคืนพื้นที่",
  ],
  overnight: [
    "ช่วงดึกสภาพคล่องบางราคาแกว่งในกรอบหลังปิด NY",
    "หลัง NY ปิด ตลาดทองเข้าสู่โหมดสะสมโครงสร้างสำหรับเซสชันถัดไป",
    "ดึกคืนนี้โมเมนตัมชะลอ ตลาดรอ catalyst ใหม่ช่วงเอเชียเปิด",
  ],
};

const STRUCTURE_INSIGHTS = [
  "สิ่งที่นักเทรดส่วนใหญ่มองข้ามคือโซน liquidity ใต้ swing low ล่าสุดที่ยังไม่ถูกเก็บ ทำให้ความเสี่ยง sweep ก่อนขึ้นต่อสูงกว่าที่ราคาบอก",
  "สิ่งที่ไม่ชัดในกราฟรายชั่วโมงคือ การกระจายตำแหน่ง retail ที่ยัง net-short อยู่ ซึ่งมักเป็นเชื้อให้เกิด squeeze ขาขึ้น",
  "โครงสร้างไทม์เฟรมใหญ่ยัง bullish แต่การ pullback ตื้นผิดปกติคือสัญญาณว่า sellers ไม่มี conviction จริง",
  "ความน่าสนใจอยู่ที่ volume delta ช่วง NY ที่สวนทาง price action บ่งชี้การดูดซับออเดอร์ขายเงียบๆ",
  "ส่วนที่ไม่มีใครพูดถึงคือ correlation ระหว่างทองกับ real yields เริ่มจางลง ตลาดกำลังให้ค่ากับ geopolitical premium มากกว่าปกติ",
  "ประเด็นซ่อนอยู่คือ การ break of structure ระดับ H4 ยังไม่มี retest สะอาด เปิดโอกาสเทรด continuation คุณภาพสูง",
];

const RISK_FLAGS = [
  "เงื่อนไขสำคัญที่ต้องจับตาคือการหลุดแนวรับ intraday พร้อม volume spike ซึ่งจะพลิก bias ทันที",
  "ต้องระวังการเปิดออเดอร์ต้นชั่วโมงที่มีข่าว US data เพราะ spread และ slippage มักเป็นเรื่องที่ทำลาย edge",
  "เงื่อนไขที่ต้องติดตามคือการปฏิเสธที่โซน supply ก่อนหน้า หากยืนไม่อยู่คือสัญญาณรอบใหม่",
  "จุดที่เปลี่ยนเกมคือการปิด H1 ใต้โซนฐาน หากไม่เกิดขึ้นให้ยังถือ bias เดิม",
  "สิ่งที่ต้องเฝ้าคือ DXY ถ้ากลับขึ้นเหนือระดับกลางของช่วงสัปดาห์จะกดดันทองอย่างรวดเร็ว",
  "จุดสำคัญคือการรักษา higher-low ล่าสุด หากหลุดจะยืนยันโครงสร้างใหม่ฝั่งลง",
];

function pickDeterministic<T>(list: T[], seed: number, salt: number) {
  if (list.length === 0) {
    throw new Error("cannot pick from empty list");
  }
  const index = Math.abs(Math.floor(seed * 9301 + salt * 49297)) % list.length;
  return list[index];
}

function composeLocalInsight(now = new Date()): string {
  const hour = bangkokHour(now);
  const session = resolveSession(hour);
  // Rotate every 10 minutes so reloads feel fresh but stay stable for a window.
  const rotation = Math.floor(now.getTime() / (10 * 60 * 1000));
  const jitter = (rotation % 997) / 997;

  const opener = pickDeterministic(BIAS_OPENERS[session], jitter, 1);
  const structure = pickDeterministic(STRUCTURE_INSIGHTS, jitter, 2);
  const risk = pickDeterministic(RISK_FLAGS, jitter, 3);

  return `${opener} ${structure} ${risk}`;
}

// ─────────────────────────────────────────────────────────────

async function generateWithGemini(apiKey: string) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchWithRetry(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: "Write a short, sharp trading insight in Thai for XAUUSD (3-5 sentences). Include current bias, one non-obvious insight, and one key condition to watch.",
                },
              ],
            },
          ],
          systemInstruction: {
            parts: [
              {
                text: "You are a senior XAUUSD analyst and insightful synthesizer for a premium trading platform. Provide concise, high-value market insights in Thai for experienced traders. Focus on market structure, liquidity dynamics, positioning, and underlying market intent. Go beyond obvious price description and highlight non-obvious insight, hidden risk, or second-order effect when relevant. Provide a clear bias with reasoning, and if signals are mixed, explain the conflict instead of forcing direction. Use clean Thai prose with no markdown, no bullet points, no bolding, and no emojis. Keep the tone professional, sharp, and composed.",
              },
            ],
          },
        }),
      },
    );

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json().catch(() => null)) as GeminiGenerateContentResponse | null;
    return normalizeInsight(payload?.candidates?.[0]?.content?.parts?.[0]?.text);
  } catch {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const allowGemini = apiKey && process.env.AI_INSIGHT_PROVIDER !== "local";

  if (allowGemini) {
    const geminiInsight = await generateWithGemini(apiKey);
    if (geminiInsight) {
      return json({ insight: geminiInsight, source: "gemini" });
    }
  }

  try {
    const local = composeLocalInsight();
    return json({ insight: local, source: "local" });
  } catch {
    return json({ insight: FALLBACK_INSIGHT, source: "fallback" });
  }
}
