import re

with open("src/components/trading-monitor/DashboardClient.tsx", "r") as f:
    content = f.read()

# Replace detailState and detailRows
start_str = "  const detailState ="
end_str = "            : [];\n"

start_idx = content.find(start_str)
end_idx = content.find(end_str) + len(end_str)

old_block = content[start_idx:end_idx]

new_block = """  const isKpiExpanded = (key: ExpandableKpiKey) => expandedKpi === key;
  const handleTimeframeChange = useCallback((nextTimeframe: Timeframe) => {
    trackTimeframeChange(accountDisplayName, nextTimeframe);
    setExpandedKpiState((current) =>
      current?.value ? { scope: `${account.id}:${nextTimeframe}`, value: current.value } : current,
    );
    setTimeframe(nextTimeframe);
  }, [accountDisplayName, account.id]);
  
  const openPositionSwap = positionsDetail.data?.openPositions.reduce((total, position) => total + Number(position.swap ?? 0), 0);
  const currentMargin = positionsDetail.data?.account.margin;
  const currentMarginLevel = positionsDetail.data?.account.margin_level;

  let detailState = null;
  let detailRows: Array<{
    label: string;
    value: string;
    tone: MetricTone;
    meta?: string;
    fullValue?: string;
    hint?: KpiHintContent;
  }> = [];

  switch (expandedKpi) {
    case "gain":
      detailState = profitDetail;
      detailRows = [
        {
          label: "Commission",
          value: formatCompactSignedNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission), 1),
          tone: toneFromNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission)),
          fullValue: formatSignedCurrency(normalizeNegativeAmount(profitDetail.data?.summary.totalCommission), 2),
          hint: {
            title: "Commission",
            definition: "ค่าธรรมเนียมโบรกเกอร์ต่อออเดอร์",
            purpose: "ต้นทุนจากการซื้อขาย เทรดบ่อยยิ่งสะสมมาก ควรดูสัดส่วนกับกำไรรวม",
          },
        },
        {
          label: "Swap",
          value: formatCompactSignedNumber(profitDetail.data?.summary.totalSwap, 1),
          tone: toneFromNumber(profitDetail.data?.summary.totalSwap),
          fullValue: formatSignedCurrency(profitDetail.data?.summary.totalSwap, 2),
          hint: {
            title: "Swap",
            definition: "ดอกเบี้ยถือ position ข้ามคืน",
            purpose: "สำคัญสำหรับกลยุทธ์ที่ถือ position ข้ามคืน บางคู่มี swap เป็นบวก",
          },
        },
        {
          label: "Deposits",
          value: formatCompactSignedNumber(profitDetail.data?.summary.totalDeposit, 1),
          tone: "positive",
          fullValue: formatSignedCurrency(profitDetail.data?.summary.totalDeposit, 2),
          hint: {
            title: "Total Deposits",
            definition: "เงินที่เติมเข้าบัญชีในช่วงที่เลือก",
            purpose: "แยกกำไรจริงออกจากยอดที่เพิ่มเพราะเติมเงิน ช่วยคำนวณ net return จริง",
          },
        },
        {
          label: "Withdrawals",
          value: formatCompactSignedNumber(normalizeNegativeAmount(profitDetail.data?.summary.totalWithdrawal), 1),
          tone: "warning",
          fullValue: formatSignedCurrency(normalizeNegativeAmount(profitDetail.data?.summary.totalWithdrawal), 2),
          hint: {
            title: "Total Withdrawals",
            definition: "เงินที่ถอนจากบัญชีในช่วงที่เลือก",
            purpose: "ติดตามเงินที่ถอนออก เพื่อคำนวณผลตอบแทนรวมจากบัญชี",
          },
        },
      ];
      break;
    case "dd":
      detailState = balanceDetail;
      detailRows = [
        {
          label: "ABS",
          value: formatCompactNumber(balanceDetail.data?.summary.absoluteDrawdown, 1),
          tone: drawdownTone(balanceDetail.data?.summary.absoluteDrawdown),
          meta: "Balance absolute drawdown",
          fullValue: formatCurrency(balanceDetail.data?.summary.absoluteDrawdown, 2),
          hint: {
            title: "Balance Absolute Drawdown",
            definition: "ยอดย่อตัวของ balance จากฐานเริ่มต้น",
            purpose: "บอกว่า balance เคยลงต่ำกว่าทุนเริ่มต้นมากแค่ไหน ใช้ดูว่าบัญชียังอยู่เหนือทุนหรือไม่",
          },
        },
        {
          label: "MAX",
          value: formatCompactNumber(balanceDetail.data?.summary.maximalDrawdownAmount, 1),
          tone: drawdownTone(balanceDetail.data?.summary.maximalDrawdownAmount),
          meta: "Balance maximal drawdown",
          fullValue: formatCurrency(balanceDetail.data?.summary.maximalDrawdownAmount, 2),
          hint: {
            title: "Balance Maximal Drawdown",
            definition: "DD สูงสุดจาก peak ลงถึง trough",
            purpose: "worst-case จริงที่เกิดขึ้น ใช้ตั้ง drawdown limit หรือ stop system",
          },
        },
        {
          label: "WIN",
          value: formatPlainPercent(overview.data?.kpis.winPercent, 1),
          tone: toneFromNumber(overview.data?.kpis.winPercent),
          meta: "Closed positions win rate",
          fullValue: formatPlainPercent(overview.data?.kpis.winPercent, 1),
          hint: {
            title: "Win Rate",
            definition: "สัดส่วนออเดอร์ที่ปิดเป็นกำไร",
            purpose: "ต้องดูคู่กับ risk/reward — win rate 40% ยังทำกำไรได้ถ้า RR สูงพอ",
          },
        },
      ];
      break;
    case "trades":
      detailState = positionsDetail;
      detailRows = [
        {
          label: "ACTIVITY",
          value: formatPlainPercent(positionsDetail.data?.summary.tradeActivityPercent, 1),
          tone: toneFromNumber(positionsDetail.data?.summary.tradeActivityPercent),
          meta: "Activity%",
          hint: {
            title: "Trade Activity",
            definition: "สัดส่วนวันที่มีการเทรดในช่วงที่เลือก",
            purpose: "บ่งบอกว่า account นี้ยัง active หรือเงียบลง ช่วยตรวจสอบความสม่ำเสมอ",
          },
        },
        {
          label: "TR/WK",
          value: formatRatioValue(positionsDetail.data?.summary.tradesPerWeek, 1),
          tone: toneFromNumber(positionsDetail.data?.summary.tradesPerWeek),
          meta: "Trade per week",
          hint: {
            title: "Trades per Week",
            definition: "จำนวนออเดอร์เฉลี่ยต่อสัปดาห์",
            purpose: "เปรียบเทียบ pace ของระบบ — ค่าสูงชี้ scalping, ค่าต่ำชี้ position trading",
          },
        },
        {
          label: "HOLD",
          value: formatAverageHoldTime(positionsDetail.data?.summary.averageHoldHours),
          tone: "neutral",
          meta: "Average hold time",
          hint: {
            title: "Average Hold Time",
            definition: "ระยะเวลาเฉลี่ยที่ถือ position ก่อนปิด",
            purpose: "จัดประเภทกลยุทธ์ — นาที = scalper, ชั่วโมง = day trader, วัน = swing",
          },
        },
      ];
      break;
    case "opens":
      detailState = positionsDetail;
      detailRows = [
        {
          label: "P/L",
          value: formatCompactSignedNumber(positionsDetail.data?.summary.floatingProfit, 1),
          tone: toneFromNumber(positionsDetail.data?.summary.floatingProfit),
          fullValue: formatSignedCurrency(positionsDetail.data?.summary.floatingProfit, 2),
          hint: {
            title: "Floating P/L",
            definition: "กำไร/ขาดทุนของ position ที่ยังไม่ปิด",
            purpose: "ยังไม่ใช่กำไรจริงจนกว่าจะปิด position อาจเปลี่ยนแปลงได้ตลอดเวลา",
          },
        },
        {
          label: "Swap",
          value: formatCompactSignedNumber(openPositionSwap, 1),
          tone: toneFromNumber(openPositionSwap),
          fullValue: formatSignedCurrency(openPositionSwap, 2),
          hint: {
            title: "Open Swap",
            definition: "ดอกเบี้ยค้างของ position ที่ยังเปิดอยู่",
            purpose: "ต้นทุนสะสมที่เพิ่มขึ้นทุกวัน ยิ่งถือนานยิ่งกระทบกำไรสุทธิ",
          },
        },
        {
          label: "Margin",
          value: formatCompactNumber(currentMargin, 1),
          tone: Number.isFinite(currentMargin) && (currentMargin ?? 0) > 0 ? "warning" : "muted",
          fullValue: formatCurrency(currentMargin, 2),
          hint: {
            title: "Used Margin",
            definition: "เงินค้ำประกันสำหรับ position ที่เปิดอยู่",
            purpose: "เงินที่โบรกเกอร์ lock ไว้ ยิ่งใช้มากยิ่งเสี่ยง margin call หากตลาดผิดทาง",
          },
        },
        {
          label: "Level",
          value: formatPlainPercent(currentMarginLevel, 1),
          tone: marginLevelTone(currentMarginLevel),
          fullValue: formatPlainPercent(currentMarginLevel, 1),
          hint: {
            title: "Margin Level",
            definition: "equity ÷ margin เป็น % สะท้อนความแข็งแรงของบัญชี",
            purpose: "ต่ำกว่า 100% = margin call zone ควรรักษาไว้สูงกว่า 200% เพื่อความปลอดภัย",
          },
        },
      ];
      break;
  }
"""

new_content = content[:start_idx] + new_block + content[end_idx:]

with open("src/components/trading-monitor/DashboardClient.tsx", "w") as f:
    f.write(new_content)
