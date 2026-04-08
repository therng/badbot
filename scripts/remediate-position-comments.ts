import "dotenv/config";

import { Prisma, PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PREVIEW_LIMIT = 25;

const numericCommentSql = Prisma.sql`
  "close_time" IS NOT NULL
  AND "comment" IS NOT NULL
  AND BTRIM("comment") ~ '^-?[0-9]+(\.[0-9]+)?$'
`;

async function main() {
  console.log(`Scanning for corrupted numeric Position comments${APPLY ? " (apply mode)" : " (dry run)"}...`);

  const [countRows, previewRows] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "Position"
      WHERE ${numericCommentSql}
    `),
    prisma.$queryRaw<Array<{
      id: string;
      positionNo: string;
      accountNo: string;
      reportDate: Date;
      profit: Prisma.Decimal;
      comment: string | null;
    }>>(Prisma.sql`
      SELECT
        p."id",
        p."position_no" AS "positionNo",
        a."account_number" AS "accountNo",
        p."report_date" AS "reportDate",
        p."profit",
        p."comment"
      FROM "Position" p
      JOIN "Account" a ON a."id" = p."account_id"
      WHERE ${numericCommentSql}
      ORDER BY p."report_date" DESC, p."position_no" ASC
      LIMIT ${PREVIEW_LIMIT}
    `),
  ]);

  const total = Number(countRows[0]?.count ?? 0n);
  console.log(`Matched ${total} closed Position row(s) with numeric-only comments.`);

  if (previewRows.length > 0) {
    console.log(`Previewing up to ${PREVIEW_LIMIT} affected row(s):`);
    for (const row of previewRows) {
      console.log(
        `- account=${row.accountNo} position=${row.positionNo} reportDate=${row.reportDate.toISOString()} profit=${row.profit.toString()} comment=${row.comment ?? ""}`,
      );
    }
  }

  if (!APPLY) {
    console.log("Dry run complete. Re-run with --apply to set these comments to NULL.");
    return;
  }

  if (total === 0) {
    console.log("Nothing to update.");
    return;
  }

  const updated = await prisma.$executeRaw(Prisma.sql`
    UPDATE "Position"
    SET "comment" = NULL
    WHERE ${numericCommentSql}
  `);

  console.log(`Updated ${updated} Position row(s).`);
}

void main()
  .catch((error) => {
    console.error("Position comment remediation failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
