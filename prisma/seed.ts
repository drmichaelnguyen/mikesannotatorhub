import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("demo123", 10);
  await prisma.user.upsert({
    where: { email: "reviewer@example.com" },
    update: { passwordHash: hash, name: "Lead Reviewer", role: UserRole.REVIEWER },
    create: {
      email: "reviewer@example.com",
      passwordHash: hash,
      name: "Lead Reviewer",
      role: UserRole.REVIEWER,
    },
  });
  await prisma.user.upsert({
    where: { email: "annotator@example.com" },
    update: { passwordHash: hash, name: "Sample Annotator", role: UserRole.ANNOTATOR },
    create: {
      email: "annotator@example.com",
      passwordHash: hash,
      name: "Sample Annotator",
      role: UserRole.ANNOTATOR,
    },
  });
  console.log("Seed OK: reviewer@example.com / annotator@example.com — password: demo123");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
