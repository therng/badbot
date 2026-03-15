import { Client } from 'basic-ftp';
import { PrismaClient } from '@prisma/client';
import { parseReport } from '../lib/parser/index';

const prisma = new PrismaClient();

const FTP_HOST = process.env.FTP_HOST || 'therng.thddns.net';
const FTP_PORT = parseInt(process.env.FTP_PORT || '21', 10);
const FTP_USER = process.env.FTP_USER || 'supachai';
const FTP_PASS = process.env.FTP_PASS || '9717';
const FTP_PATH = process.env.FTP_PATH || 'usb1_1_1/Metatrader5';
const WORKER_POLL_MS = parseInt(process.env.WORKER_POLL_MS || '60000', 10);
const RUN_ONCE = process.env.WORKER_RUN_ONCE === 'true';
const FORCE_REIMPORT = process.env.WORKER_FORCE_REIMPORT === 'true';

async function deleteReportGraph(reportId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.closedPosition.deleteMany({ where: { report_id: reportId } });
    await tx.orderHistory.deleteMany({ where: { report_id: reportId } });
    await tx.dealLedger.deleteMany({ where: { report_id: reportId } });
    await tx.openPositionSnapshot.deleteMany({ where: { report_id: reportId } });
    await tx.workingOrderSnapshot.deleteMany({ where: { report_id: reportId } });
    await tx.accountSummarySnapshot.deleteMany({ where: { report_id: reportId } });
    await tx.accountReport.delete({ where: { id: reportId } });
  });
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
      secure: false
    });

    console.log(`Connected. Changing working directory to ${FTP_PATH}...`);
    await client.cd(FTP_PATH);

    const files = await client.list();
    const htmlFiles = files.filter(f => f.name.endsWith('.html') && !f.name.startsWith('._'));

    console.log(`Found ${htmlFiles.length} HTML reports.`);

    for (const file of htmlFiles) {
      console.log(`Processing ${file.name}...`);
      
      // Check if we already processed this exact file via modified time if needed
      // Or we can download and check hash
      
      // In a real scenario we download to a stream/memory
      const buffers: Buffer[] = [];
      const writable = new (require('stream').Writable)({
        write(chunk: any, encoding: any, callback: any) {
          buffers.push(chunk);
          callback();
        }
      });

      await client.downloadTo(writable, file.name);
      const buf = Buffer.concat(buffers);
      const htmlContent = (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE)
        ? buf.toString('utf16le')
        : buf.toString('utf-8');

      // Parse report
      const parsedData = parseReport(htmlContent);

      // Check hash
      const existingReport = await prisma.accountReport.findUnique({
        where: { file_hash: parsedData.fileHash }
      });

      if (existingReport && !FORCE_REIMPORT) {
        console.log(`Skipping ${file.name}, already imported.`);
        continue;
      }

      if (existingReport && FORCE_REIMPORT) {
        console.log(`Force reimport enabled. Replacing previous import for ${file.name}...`);
        await deleteReportGraph(existingReport.id);
      }

      console.log(`Saving new report data to DB for ${parsedData.metadata.account_number}...`);

      const accountNumber = parsedData.metadata.account_number.trim();
      if (!accountNumber) {
        console.warn(`Skipping ${file.name}: account number is missing from report metadata.`);
        continue;
      }

      const ownerName = parsedData.metadata.owner_name.trim() || null;
      const currency = parsedData.metadata.currency.trim() || 'USD';
      const server = parsedData.metadata.server.trim();
      const accountMode = parsedData.metadata.account_mode.trim() || null;
      const positionMode = parsedData.metadata.position_mode.trim() || null;
      
      // Save data using a transaction
      await prisma.$transaction(async (tx) => {
        const account = await tx.account.upsert({
          where: { account_number: accountNumber },
          update: {
            owner_name: ownerName,
            currency,
            server,
            account_mode: accountMode,
            position_mode: positionMode,
          },
          create: {
            account_number: accountNumber,
            owner_name: ownerName,
            currency,
            server,
            account_mode: accountMode,
            position_mode: positionMode,
          }
        });

        const report = await tx.accountReport.create({
          data: {
            account_id: account.id,
            file_name: file.name,
            file_hash: parsedData.fileHash,
            report_timestamp: parsedData.metadata.report_timestamp,
          }
        });

        // Insert Closed Positions
        if (parsedData.closedPositions.length > 0) {
          await tx.closedPosition.createMany({
            data: parsedData.closedPositions.map(p => ({ ...p, report_id: report.id }))
          });
        }

        // Insert Order History
        if (parsedData.orderHistory.length > 0) {
          await tx.orderHistory.createMany({
            data: parsedData.orderHistory.map(o => ({ ...o, report_id: report.id }))
          });
        }

        // Insert Deal Ledger
        if (parsedData.dealLedger.length > 0) {
          await tx.dealLedger.createMany({
            data: parsedData.dealLedger.map(d => ({ ...d, report_id: report.id }))
          });
        }

        // Insert Open Positions
        if (parsedData.openPositions.length > 0) {
          await tx.openPositionSnapshot.createMany({
            data: parsedData.openPositions.map(op => ({ ...op, report_id: report.id }))
          });
        }

        // Insert Working Orders
        if (parsedData.workingOrders.length > 0) {
          await tx.workingOrderSnapshot.createMany({
            data: parsedData.workingOrders.map(w => ({ ...w, report_id: report.id }))
          });
        }

        // Insert Summary
        if (parsedData.accountSummary.balance !== undefined) {
           await tx.accountSummarySnapshot.create({
             data: {
               report_id: report.id,
               balance: parsedData.accountSummary.balance,
               equity: parsedData.accountSummary.equity,
               margin: parsedData.accountSummary.margin,
               free_margin: parsedData.accountSummary.free_margin,
               floating_pl: parsedData.accountSummary.floating_pl,
               margin_level: parsedData.accountSummary.margin_level
             }
           });
        }
      });
      console.log(`Successfully saved ${file.name}.`);
    }

  } catch (err) {
    console.error('FTP Error:', err);
  } finally {
    client.close();
  }
}

async function runWorker() {
  console.log('Starting ingestion worker...');
  if (RUN_ONCE) {
    console.log(`Run-once mode enabled (force reimport: ${FORCE_REIMPORT ? 'on' : 'off'}).`);
    await processReports();
    console.log('Run-once mode complete. Exiting.');
    return;
  }

  while (true) {
    await processReports();
    console.log(`Waiting ${WORKER_POLL_MS / 1000} seconds before next poll...`);
    await new Promise(resolve => setTimeout(resolve, WORKER_POLL_MS));
  }
}

// Start if executed directly
if (require.main === module) {
  runWorker();
}
