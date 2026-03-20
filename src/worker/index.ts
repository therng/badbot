import { Writable } from "node:stream";

import { Client } from "basic-ftp";

import { parseReport } from "../lib/parser";
import { prisma } from "../lib/prisma";

const FTP_HOST = process.env.FTP_HOST || "therng.thddns.net";
const FTP_PORT = Number.parseInt(process.env.FTP_PORT || "21", 10);
const FTP_USER = process.env.FTP_USER || "supachai";
const FTP_PASS = process.env.FTP_PASS || "9717";
const FTP_PATH = process.env.FTP_PATH || "usb1_1_1/Metatrader5";
const WORKER_POLL_MS = Number.parseInt(process.env.WORKER_POLL_MS || "150000", 10);
const FILE_STABLE_MS = Number.parseInt(process.env.WORKER_FILE_STABLE_MS || "60000", 10);
const MIN_FILE_SIZE_BYTES = Number.parseInt(process.env.WORKER_MIN_FILE_SIZE_BYTES || "1024", 10);
const RUN_ONCE = process.env.WORKER_RUN_ONCE === "true";
const FORCE_REIMPORT = process.env.WORKER_FORCE_REIMPORT === "true";

async function deleteReportGraph(reportId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.dealLedger.deleteMany({ where: { reportId } });
    await tx.openPositionSnapshot.deleteMany({ where: { reportId } });
    await tx.workingOrderSnapshot.deleteMany({ where: { reportId } });
    await tx.accountSummarySnapshot.deleteMany({ where: { reportId } });
    await tx.reportResultSnapshot.deleteMany({ where: { reportId } });
    await tx.accountReport.delete({ where: { id: reportId } });
  });
}

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

async function downloadFile(client: Client, fileName: string) {
  const chunks: Buffer[] = [];
  const writable = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });

  await client.downloadTo(writable, fileName);
  return Buffer.concat(chunks);
}

function isHtmlReportFile(file: { name: string }) {
  return file.name.endsWith(".html") && !file.name.startsWith("._");
}

function shouldReadFile(file: { name: string; size?: number; modifiedAt?: Date }) {
  if (!isHtmlReportFile(file)) {
    return false;
  }

  if (typeof file.size === "number" && file.size > 0 && file.size < MIN_FILE_SIZE_BYTES) {
    return false;
  }

  if (file.modifiedAt instanceof Date && Number.isFinite(file.modifiedAt.getTime())) {
    const ageMs = Date.now() - file.modifiedAt.getTime();
    if (ageMs < FILE_STABLE_MS) {
      return false;
    }
  }

  return true;
}

async function importReport(fileName: string, htmlContent: string) {
  const parsedData = parseReport(htmlContent);
  const existingReport = await prisma.accountReport.findUnique({
    where: { fileHash: parsedData.fileHash },
  });

  if (existingReport && !FORCE_REIMPORT) {
    console.log(`Skipping ${fileName}, already imported.`);
    return "skipped" as const;
  }

  if (existingReport && FORCE_REIMPORT) {
    console.log(`Force reimport enabled. Replacing previous import for ${fileName}...`);
    await deleteReportGraph(existingReport.id);
  }

  const accountNumber = parsedData.metadata.account_number.trim();
  if (!accountNumber) {
    console.warn(`Skipping ${fileName}: account number is missing from report metadata.`);
    return "skipped" as const;
  }

  const ownerName = parsedData.metadata.owner_name.trim() || null;
  const company = parsedData.metadata.company?.trim() || null;
  const currency = parsedData.metadata.currency.trim() || "USD";
  const server = parsedData.metadata.server.trim() || "UNKNOWN";
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.upsert({
      where: { accountNumber },
      update: {
        ownerName,
        company,
        currency,
        server,
      },
      create: {
        accountNumber,
        ownerName,
        company,
        currency,
        server,
      },
    });

    const report = await tx.accountReport.create({
      data: {
        accountId: account.id,
        fileName,
        fileHash: parsedData.fileHash,
        reportDate: parsedData.metadata.report_timestamp,
      },
    });

    if (parsedData.dealLedger.length) {
      await tx.dealLedger.createMany({
        data: parsedData.dealLedger.map((deal) => ({ ...deal, reportId: report.id })),
      });
    }

    if (parsedData.openPositions.length) {
      await tx.openPositionSnapshot.createMany({
        data: parsedData.openPositions.map((position) => ({ ...position, reportId: report.id })),
      });
    }

    if (parsedData.workingOrders.length) {
      await tx.workingOrderSnapshot.createMany({
        data: parsedData.workingOrders.map((order) => ({
          ...order,
          price: order.price ?? 0,
          reportId: report.id,
        })),
      });
    }

    await tx.accountSummarySnapshot.create({
      data: {
        reportId: report.id,
        balance: parsedData.accountSummary.balance,
        creditFacility: parsedData.accountSummary.credit_facility ?? 0,
        equity: parsedData.accountSummary.equity,
        margin: parsedData.accountSummary.margin,
        freeMargin: parsedData.accountSummary.free_margin,
        floatingPl: parsedData.accountSummary.floating_pl,
        marginLevel:
          Number.isFinite(parsedData.accountSummary.margin_level) && parsedData.accountSummary.margin_level !== 0
            ? parsedData.accountSummary.margin_level
            : null,
      },
    });

    if (parsedData.reportResults) {
      await tx.reportResultSnapshot.create({
        data: {
          reportId: report.id,
          totalCommission: parsedData.reportResults.total_commission ?? null,
          totalSwap: parsedData.reportResults.total_swap ?? null,
          totalNetProfit: parsedData.reportResults.total_net_profit ?? null,
          grossProfit: parsedData.reportResults.gross_profit ?? null,
          grossLoss: parsedData.reportResults.gross_loss ?? null,
          profitFactor: parsedData.reportResults.profit_factor ?? null,
          expectedPayoff: parsedData.reportResults.expected_payoff ?? null,
          recoveryFactor: parsedData.reportResults.recovery_factor ?? null,
          sharpeRatio: parsedData.reportResults.sharpe_ratio ?? null,
          balanceDrawdownAbsolute: parsedData.reportResults.balance_drawdown_absolute ?? null,
          balanceDrawdownMaximal: parsedData.reportResults.balance_drawdown_maximal ?? null,
          balanceDrawdownMaximalPct: parsedData.reportResults.balance_drawdown_maximal_pct ?? null,
          balanceDrawdownRelativePct: parsedData.reportResults.balance_drawdown_relative_pct ?? null,
          balanceDrawdownRelative: parsedData.reportResults.balance_drawdown_relative ?? null,
          totalTrades: parsedData.reportResults.total_trades ?? null,
          shortTradesWon: parsedData.reportResults.short_trades_won ?? null,
          shortTradesTotal: parsedData.reportResults.short_trades_total ?? null,
          longTradesWon: parsedData.reportResults.long_trades_won ?? null,
          longTradesTotal: parsedData.reportResults.long_trades_total ?? null,
          profitTradesCount: parsedData.reportResults.profit_trades_count ?? null,
          lossTradesCount: parsedData.reportResults.loss_trades_count ?? null,
          largestProfitTrade: parsedData.reportResults.largest_profit_trade ?? null,
          largestLossTrade: parsedData.reportResults.largest_loss_trade ?? null,
          averageProfitTrade: parsedData.reportResults.average_profit_trade ?? null,
          averageLossTrade: parsedData.reportResults.average_loss_trade ?? null,
          maximumConsecutiveWins: parsedData.reportResults.maximum_consecutive_wins ?? null,
          maximumConsecutiveLosses: parsedData.reportResults.maximum_consecutive_losses ?? null,
        },
      });
    }
  });

  console.log(`Successfully saved ${fileName}.`);
  return "imported" as const;
}

export async function processReports() {
  const client = new Client();
  client.ftp.verbose = false;

  try {
    console.log(`Connecting to FTP ${FTP_HOST}:${FTP_PORT}...`);
    await client.access({
      host: FTP_HOST,
      port: FTP_PORT,
      user: FTP_USER,
      password: FTP_PASS,
      secure: false,
    });

    console.log(`Connected. Changing working directory to ${FTP_PATH}...`);
    await client.cd(FTP_PATH);

    const files = await client.list();
    const htmlFiles = files.filter(isHtmlReportFile).sort((left, right) => left.name.localeCompare(right.name));
    const readyFiles = htmlFiles.filter(shouldReadFile);
    const deferredFiles = htmlFiles.filter((file) => !shouldReadFile(file));

    const stats = {
      found: htmlFiles.length,
      ready: readyFiles.length,
      deferred: deferredFiles.length,
      imported: 0,
      skipped: 0,
      failed: 0,
    };

    console.log(
      `Found ${htmlFiles.length} HTML reports. Ready=${readyFiles.length} deferred=${deferredFiles.length} stableMs=${FILE_STABLE_MS}`,
    );

    if (deferredFiles.length > 0) {
      console.log(`Deferring recent or incomplete files: ${deferredFiles.map((file) => file.name).join(", ")}`);
    }

    for (const file of readyFiles) {
      console.log(`Processing ${file.name}...`);

      try {
        const contentBuffer = await downloadFile(client, file.name);
        const htmlContent = decodeReportBuffer(contentBuffer);
        const result = await importReport(file.name, htmlContent);
        stats[result] += 1;
      } catch (error) {
        stats.failed += 1;
        console.error(`Failed to process ${file.name}:`, error);
      }
    }

    console.log(
      `Report pass complete. Found=${stats.found} ready=${stats.ready} deferred=${stats.deferred} imported=${stats.imported} skipped=${stats.skipped} failed=${stats.failed}`,
    );

    return stats;
  } finally {
    client.close();
  }
}

async function runWorker() {
  console.log("Starting ingestion worker...");

  if (RUN_ONCE) {
    console.log(`Run-once mode enabled (force reimport: ${FORCE_REIMPORT ? "on" : "off"}).`);
    const result = await processReports();
    if (result.failed > 0) {
      throw new Error(`Run-once import finished with ${result.failed} failed report(s).`);
    }
    console.log("Run-once mode complete. Exiting.");
    return;
  }

  while (true) {
    try {
      await processReports();
    } catch (error) {
      console.error("Worker cycle failed:", error);
    }

    console.log(`Waiting ${WORKER_POLL_MS / 1000} seconds before next poll...`);
    await new Promise((resolve) => setTimeout(resolve, WORKER_POLL_MS));
  }
}

if (require.main === module) {
  void runWorker()
    .catch((error) => {
      console.error("Worker crashed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
