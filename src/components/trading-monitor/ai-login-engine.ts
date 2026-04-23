import type { LoadingInsightResponse } from "@/app/api/loading-insight/route";

import {
  readLoadingInsightCache,
  writeLoadingInsightCache,
} from "./ai-login-cache";

export type SessionKey = "asia" | "london" | "ny" | "overnight";
type BrowserStorage = Pick<Storage, "getItem" | "setItem">;

export const FALLBACK_TRENDS = [
  "พร้อมสแกนโครงสร้าง — รอสัญญาณยืนยัน",
  "โฟกัส liquidity zone สำคัญก่อนเข้า",
  "รักษา bias จนกว่าจะเสียฐาน — ไม่สวน",
  "เข้าเทรดเมื่อจังหวะยืนยันเท่านั้น",
];

const TREND_BANK: Record<SessionKey, string[][]> = {
  asia: [
    [
      "กรอบเอเชียเปิดสะสม — ฝั่งซื้อคุมจังหวะ",
      "สภาพคล่องใต้ฐานมีโอกาสถูกกวาดก่อนขึ้น",
      "แรงขายเร่งเมื่อหลุดฐาน — ระวัง fake break",
      "รอ liquidity sweep แล้วค่อยเข้าตาม bias",
    ],
    [
      "โครงสร้างพักตัวยังไม่เสีย — ยืนเหนือ HL",
      "demand zone ก่อนหน้าคือจุดซ่อนแรงรอบนี้",
      "เสีย higher low = bias เปลี่ยน ให้ flip short",
      "buy the dip เหนือฐาน ไม่ไล่ราคาที่ supply",
    ],
  ],
  london: [
    [
      "ลอนดอนหนุนแรงซื้อเหนือกรอบสะสมเอเชีย",
      "liquidity ฝั่งบนยังเปิด — มีที่วิ่งต่อ",
      "reject แรงตรงยอด = สัญญาณ distribution",
      "รอ retest หลัง BOS แล้วค่อย entry ตาม",
    ],
    [
      "โมเมนตัมยุโรปพยุงฝั่งบวก — ยังไม่เสีย",
      "โซน sweep ใต้ low ลอนดอนยังสำคัญมาก",
      "หลุดฐานลอนดอน = เกมเปลี่ยน short bias",
      "continuation trade หลังย่อ — ไม่ตามยอด",
    ],
  ],
  ny: [
    [
      "NY เปิดตามซื้อชัด — volume ยืนยัน bias",
      "จุดสำคัญคือ absorption zone ฝั่ง sell",
      "DXY เด้งแรง = กดทอง ให้ระวังก่อนเข้า",
      "ถือ bias บวกจนกว่าเสียฐาน — trail stop",
    ],
    [
      "กระแสหลักเอนเข้าผู้ซื้อ — NY confirm",
      "liquidity เหนือยอดยังล่อราคา ระวัง trap",
      "ข่าวสหรัฐพลิกจังหวะได้เร็ว — ลด size",
      "ลดขนาดไม้ก่อน news แล้วค่อยเติมหลังชัด",
    ],
  ],
  overnight: [
    [
      "ตลาดดึกสะสมกำลังก่อนเอเชีย — range แคบ",
      "โซนเก็บของซ่อนใต้ swing low ล่าสุด",
      "หลุดฐานเงียบ = เร่งตัวฝั่งลง ห้ามรับ",
      "รอ confirmation ก่อนเปิดไม้ — ไม่เดา",
    ],
    [
      "สภาพคล่องบาง แต่โครงสร้างยังไม่เสีย",
      "แรงซ่อนอยู่แถว demand เดิม — จับตา",
      "fake break ช่วงดึกทำลายจังหวะง่าย",
      "ไม้เบาเท่านั้น — รอเช้าเพิ่มน้ำหนัก",
    ],
  ],
};

function bangkokHour(date = new Date()) {
  const utcMinutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  return Math.floor(((utcMinutes + 7 * 60) % (24 * 60)) / 60);
}

function resolveSession(hour: number): SessionKey {
  if (hour >= 7 && hour < 14) return "asia";
  if (hour >= 14 && hour < 20) return "london";
  if (hour >= 20 || hour < 2) return "ny";
  return "overnight";
}

function pickDeterministic<T>(list: T[], seed: number, salt: number) {
  const index = Math.abs(Math.floor(seed * 9301 + salt * 49297)) % list.length;
  return list[index];
}

function isValidLoadingInsightResponse(value: unknown): value is LoadingInsightResponse {
  return Boolean(
    value &&
    typeof value === "object" &&
    Array.isArray((value as LoadingInsightResponse).insights) &&
    (value as LoadingInsightResponse).insights.length >= 4,
  );
}

export function buildLocalTrends(now = new Date()) {
  const hour = bangkokHour(now);
  const session = resolveSession(hour);
  const rotation = Math.floor(now.getTime() / (10 * 60 * 1000));
  const jitter = (rotation % 997) / 997;

  return pickDeterministic(TREND_BANK[session], jitter, hour) ?? FALLBACK_TRENDS;
}

export function mapLoadingInsightsToTrends(payload: LoadingInsightResponse) {
  const trends = payload.insights
    .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
    .slice(0, 4);

  return trends.length === 4 ? trends : FALLBACK_TRENDS;
}

export function getInitialAiLoginTrends(
  storage: BrowserStorage | null | undefined,
  now = new Date(),
) {
  const cached = readLoadingInsightCache(storage, now);
  return cached ? mapLoadingInsightsToTrends(cached) : buildLocalTrends(now);
}

type ResolveAiLoginTrendsOptions = {
  force?: boolean;
  storage: BrowserStorage | null | undefined;
  fetchImpl: typeof fetch;
  now?: Date;
};

export async function resolveAiLoginTrends({
  force = false,
  storage,
  fetchImpl,
  now = new Date(),
}: ResolveAiLoginTrendsOptions) {
  const cached = readLoadingInsightCache(storage, now);
  if (!force && cached) {
    return mapLoadingInsightsToTrends(cached);
  }

  try {
    const response = await fetchImpl("/api/loading-insight", { cache: "no-store" });
    if (!response.ok) {
      throw new Error(`status ${response.status}`);
    }

    const payload = await response.json();
    if (!isValidLoadingInsightResponse(payload)) {
      throw new Error("invalid insight payload");
    }

    writeLoadingInsightCache(storage, payload, now);
    return mapLoadingInsightsToTrends(payload);
  } catch {
    if (cached) {
      return mapLoadingInsightsToTrends(cached);
    }

    return buildLocalTrends(now);
  }
}
