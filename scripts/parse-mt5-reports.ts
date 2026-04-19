import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseReport } from "@/lib/parser";
import { buildStandaloneMonitorData } from "@/lib/trading/standalone-model";

function decodeReportBuffer(buffer: Buffer) {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.toString("utf16le");
  }

  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.from(buffer.subarray(2));
    for (let index = 0; index < swapped.length - 1; index += 2) {
      [swapped[index], swapped[index + 1]] = [swapped[index + 1], swapped[index]];
    }
    return swapped.toString("utf16le");
  }

  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.toString("utf8", 3);
  }

  return buffer.toString("utf8");
}

async function main() {
  const args = process.argv.slice(2);
  let outJsonPath: string | null = null;
  let outJsPath: string | null = null;
  const inputs: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--out-json") {
      outJsonPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    if (value === "--out-js") {
      outJsPath = args[index + 1] ?? null;
      index += 1;
      continue;
    }

    inputs.push(value);
  }

  if (!inputs.length) {
    throw new Error("Usage: ts-node scripts/parse-mt5-reports.ts [--out-json path] [--out-js path] <report.html...>");
  }

  const parsed = await Promise.all(inputs.map(async (filePath) => {
    const buffer = await readFile(filePath);
    const html = decodeReportBuffer(buffer);
    return {
      fileName: path.basename(filePath),
      report: parseReport(html),
    };
  }));

  const data = buildStandaloneMonitorData(parsed);
  const json = JSON.stringify(data, null, 2);

  if (outJsonPath) {
    await writeFile(outJsonPath, `${json}\n`, "utf8");
  }

  if (outJsPath) {
    const browserData = JSON.stringify({
      generatedAt: data.generatedAt,
      accs: data.accs,
    }, null, 2);
    await writeFile(outJsPath, `window.TRADING_MONITOR_DATA = ${browserData};\n`, "utf8");
  }

  if (!outJsonPath && !outJsPath) {
    process.stdout.write(`${json}\n`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
