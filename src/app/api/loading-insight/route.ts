import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type LoadingInsightResponse = {
  insight: string;
  source: "gemini" | "fallback";
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

  // Strip markdown bolding, italics, and headers
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

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return json({ insight: FALLBACK_INSIGHT, source: "fallback" });
  }

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
      return json({ insight: FALLBACK_INSIGHT, source: "fallback" });
    }

    const payload = (await response.json().catch(() => null)) as GeminiGenerateContentResponse | null;
    const insight = normalizeInsight(payload?.candidates?.[0]?.content?.parts?.[0]?.text);

    return json({ insight: insight ?? FALLBACK_INSIGHT, source: insight ? "gemini" : "fallback" });
  } catch {
    return json({ insight: FALLBACK_INSIGHT, source: "fallback" });
  } finally {
    clearTimeout(timeoutId);
  }
}
