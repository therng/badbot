import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Cleaning database...");

  await prisma.$transaction([
    prisma.deal.deleteMany(),
    prisma.position.deleteMany(),
    prisma.openPosition.deleteMany(),
    prisma.accountSnapshot.deleteMany(),
    prisma.reportImport.deleteMany(),
    prisma.tradingAccount.deleteMany(),
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
