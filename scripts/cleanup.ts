import "dotenv/config";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning database...");

  // Using TRUNCATE with CASCADE is significantly faster than deleteMany() 
  // because it removes all rows without scanning and is a single operation.
  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE 
      "Deal", 
      "Position", 
      "OpenPosition", 
      "AccountSnapshot", 
      "AccountReportResult",
      "ReportImport", 
      "Account" 
    RESTART IDENTITY CASCADE;
  `);

  console.log("Cleanup complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
