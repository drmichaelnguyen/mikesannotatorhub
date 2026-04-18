import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const ADMIN_EMAIL: string = "dr.trongto@gmail.com";
const ADMIN_PASSWORD: string = "host1234";
const LEGACY_ADMIN_EMAIL: string = "reviewer@example.com";
const ANNOTATOR_PASSWORD: string = "demo123";

async function main() {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const annotatorHash = await bcrypt.hash(ANNOTATOR_PASSWORD, 10);
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const legacyAdmin =
    ADMIN_EMAIL === LEGACY_ADMIN_EMAIL
      ? null
      : await prisma.user.findUnique({ where: { email: LEGACY_ADMIN_EMAIL } });

  if (!existingAdmin && legacyAdmin) {
    await prisma.user.update({
      where: { email: LEGACY_ADMIN_EMAIL },
      data: {
        email: ADMIN_EMAIL,
        passwordHash: adminHash,
        name: "Lead Reviewer",
        role: UserRole.REVIEWER,
      },
    });
  } else {
    await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: { passwordHash: adminHash, name: "Lead Reviewer", role: UserRole.REVIEWER },
      create: {
        email: ADMIN_EMAIL,
        passwordHash: adminHash,
        name: "Lead Reviewer",
        role: UserRole.REVIEWER,
      },
    });
  }

  await prisma.user.upsert({
    where: { email: "annotator@example.com" },
    update: {
      passwordHash: annotatorHash,
      name: "Sample Annotator",
      role: UserRole.ANNOTATOR,
    },
    create: {
      email: "annotator@example.com",
      passwordHash: annotatorHash,
      name: "Sample Annotator",
      role: UserRole.ANNOTATOR,
    },
  });
  console.log(
    `Seed OK: admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}; annotator annotator@example.com / ${ANNOTATOR_PASSWORD}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
