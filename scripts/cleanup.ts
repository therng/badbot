import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning database...");

  await prisma.$transaction([
    prisma.dealLedger.deleteMany(),
    prisma.openPositionSnapshot.deleteMany(),
    prisma.workingOrderSnapshot.deleteMany(),
    prisma.accountSummarySnapshot.deleteMany(),
    prisma.reportResultSnapshot.deleteMany(),
    prisma.accountReport.deleteMany(),
    prisma.account.deleteMany(),
  ]);

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
