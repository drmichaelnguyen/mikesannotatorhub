import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
try {
  const columns = await prisma.$queryRawUnsafe('PRAGMA table_info("AnnotationCase")');
  if (!columns.length) throw new Error("AnnotationCase table is missing; initialize the database first.");
  if (!columns.some(column => column.name === "fiveStarBonusPercent")) {
    await prisma.$executeRawUnsafe('ALTER TABLE "AnnotationCase" ADD COLUMN "fiveStarBonusPercent" REAL');
    console.log("Added the case-specific five-star bonus column; existing cases retain legacy defaults.");
  } else {
    console.log("Case-specific five-star bonus column is already present.");
  }
} finally {
  await prisma.$disconnect();
}
