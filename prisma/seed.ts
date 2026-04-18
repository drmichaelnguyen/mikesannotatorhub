import { CaseStatus, CompensationType, PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const ADMIN_EMAIL: string = "dr.trongto@gmail.com";
const ADMIN_PASSWORD: string = "host1234";
const LEGACY_ADMIN_EMAIL: string = "reviewer@example.com";
const ANNOTATOR_PASSWORD: string = "demo123";

type AnnotatorSeed = {
  email: string;
  name: string;
  aliases?: string[];
  legacyEmail?: string;
};

type ProjectTemplate = {
  guideline: string;
  scopeOfWork: string;
  minMinutesPerCase: number;
  maxMinutesPerCase: number;
  compensationType: CompensationType;
  compensationAmount: number;
};

type CaseSeed = {
  caseId: string;
  project: string;
  annotatorName: string | null;
};

const TEAM_ANNOTATORS: AnnotatorSeed[] = [
  {
    email: "dr.trongto+annotator@gmail.com",
    name: "Trong",
    aliases: ["Trọng"],
    legacyEmail: "annotator@example.com",
  },
  {
    email: "duynhamyds@gmail.com",
    name: "Duy",
    legacyEmail: "duy.annotator@example.com",
  },
  {
    email: "thantrongthien@gmail.com",
    name: "Thiên",
    legacyEmail: "thien.annotator@example.com",
  },
  { email: "khanhnhunguyenngoc@gmail.com", name: "Như" },
];

const DEFAULT_PROJECT_TEMPLATE: ProjectTemplate = {
  guideline: "anh em coi kỹ guideline",
  scopeOfWork: "Sửa gan lách tụy cho đẹp trên axial",
  minMinutesPerCase: 15,
  maxMinutesPerCase: 60,
  compensationType: CompensationType.PER_CASE,
  compensationAmount: 200000,
};

const PROJECT_TEMPLATES: Record<string, ProjectTemplate> = {
  BC2_PDFF_tuning_set_dv_2_0_0_RB1: DEFAULT_PROJECT_TEMPLATE,
  BC2_WB_training_set_dv_1_subsample_4_RB_1: {
    guideline: "anh em coi kỹ guideline",
    scopeOfWork: "Làm theo đúng guideline của dự án và giữ mask sạch, nhất quán.",
    minMinutesPerCase: 15,
    maxMinutesPerCase: 60,
    compensationType: CompensationType.PER_CASE,
    compensationAmount: 200000,
  },
};

const SEEDED_CASES: CaseSeed[] = [
  {
    caseId: "02cd3439-948b-43dc-9180-12a9afb8798b",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Trọng",
  },
  {
    caseId: "0722edab-e1e3-46f5-b00b-a5b08694fe14",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "230d0c9b-9268-4203-958b-92651c6141ce",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "263e2391-9147-459c-8bdd-8eab18759149",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Thiên",
  },
  {
    caseId: "29134289-46c6-4887-b974-7cc697ef2253",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Thiên",
  },
  {
    caseId: "295d99db-d7ff-4b08-8014-8389cee43a05",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Thiên",
  },
  {
    caseId: "30520e3b-706b-4aba-b23a-4159fc09317c",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Như",
  },
  {
    caseId: "3128348b-c003-4785-b4d0-1ee18a786492",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "32402642-fec1-4614-9091-b8b4bd453bce",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Trọng",
  },
  {
    caseId: "3599d7e0-77f5-4f50-a7ce-f73d5e3b5199",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "35e662fd-66f8-4ab9-9497-28773e50224f",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "36c81cb7-e0dd-4a38-8a05-6fbbf38dc028",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "3cdb4a53-b738-4378-815d-ccb979eeaf8b",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "52676561-719a-4e3c-8c87-3530a3108eff",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Thiên",
  },
  {
    caseId: "551ab991-b197-42a9-84d1-b854c57f5fc7",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Thiên",
  },
  {
    caseId: "55ea657b-d4b2-4d7b-a4f9-af9f341d23f1",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Thiên",
  },
  {
    caseId: "5f64343d-2176-4292-8ac3-f8efc74e1f66",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "6036d52a-c4b7-4fb9-abaa-59639304d8f7",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "6a6c26af-7990-479e-8ade-4e85e1af8838",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "794d7e3e-64aa-418a-8686-66981b310bcf",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Như",
  },
  {
    caseId: "7d58fea8-230a-417f-9e2d-233655c89fe9",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "802468ae-a4ec-4323-8936-73a87db67a41",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "88d1d1ee-5e5d-4681-b231-8e6b392f56b1",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: "Duy",
  },
  {
    caseId: "89e03d9b-55d9-44f8-9b8b-7dc250313999",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "8d5590f4-af27-4e7d-9bdb-e21d8239bb09",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "90c17c15-97aa-4f7e-a390-952d4ef05556",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "9146b5ca-9c3b-4845-9900-ec1607415706",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "9e18021f-4c8c-4828-9fc9-3aba4bd678c8",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "ad732750-7a66-4c29-a31f-479431ff9f40",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "b34a4c0f-cb88-45ca-ba77-c32190c22417",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "b5e2ed72-f336-41b7-923b-11c9a90e50cf",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "d2be3335-2c8d-4970-b045-d9d2329ab19b",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "d589d2ec-b4a5-4b8b-be57-4625a8f51344",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "de0210ae-2504-4e80-931d-86e1ead4d9bb",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "e38ae7e2-d8fe-4ea5-b3df-caf2b22b7a20",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "eb17a252-62b0-4760-9230-212cd15bf42a",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "eb34ad8f-7be8-4814-80eb-eaee01c66186",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "f458587f-ffbb-46e4-ae22-620a97477086",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "f6c53ac8-e00b-481a-a5b6-25c7c9466f03",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "fda6ac3e-2926-4d90-b216-4a6cc505e062",
    project: "BC2_PDFF_tuning_set_dv_2_0_0_RB1",
    annotatorName: null,
  },
  {
    caseId: "5c8651eb-8a03-4308-9d70-7eba79f7c733",
    project: "BC2_WB_training_set_dv_1_subsample_4_RB_1",
    annotatorName: "Như",
  },
];

function getProjectTemplate(project: string): ProjectTemplate {
  return PROJECT_TEMPLATES[project] ?? DEFAULT_PROJECT_TEMPLATE;
}

async function upsertAdmin(adminHash: string) {
  const existingAdmin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
  const legacyAdmin =
    ADMIN_EMAIL === LEGACY_ADMIN_EMAIL
      ? null
      : await prisma.user.findUnique({ where: { email: LEGACY_ADMIN_EMAIL } });

  if (!existingAdmin && legacyAdmin) {
    return prisma.user.update({
      where: { email: LEGACY_ADMIN_EMAIL },
      data: {
        email: ADMIN_EMAIL,
        passwordHash: adminHash,
        name: "Trong",
        role: UserRole.REVIEWER,
      },
    });
  }

  return prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    update: { passwordHash: adminHash, name: "Trong", role: UserRole.REVIEWER },
    create: {
      email: ADMIN_EMAIL,
      passwordHash: adminHash,
      name: "Trong",
      role: UserRole.REVIEWER,
    },
  });
}

async function upsertAnnotators(annotatorHash: string) {
  const annotatorByAlias = new Map<string, string>();

  for (const annotator of TEAM_ANNOTATORS) {
    const existingAnnotator = await prisma.user.findUnique({ where: { email: annotator.email } });
    const legacyAnnotator = annotator.legacyEmail
      ? await prisma.user.findUnique({ where: { email: annotator.legacyEmail } })
      : null;

    const user =
      existingAnnotator && legacyAnnotator && existingAnnotator.id !== legacyAnnotator.id
        ? await prisma.$transaction(async (tx) => {
            await tx.annotationCase.updateMany({
              where: { annotatorId: legacyAnnotator.id },
              data: { annotatorId: existingAnnotator.id },
            });
            await tx.caseNote.updateMany({
              where: { authorId: legacyAnnotator.id },
              data: { authorId: existingAnnotator.id },
            });
            await tx.user.delete({ where: { id: legacyAnnotator.id } });
            return tx.user.update({
              where: { id: existingAnnotator.id },
              data: {
                name: annotator.name,
                role: UserRole.ANNOTATOR,
              },
            });
          })
        : !existingAnnotator && legacyAnnotator
          ? await prisma.user.update({
              where: { id: legacyAnnotator.id },
              data: {
                email: annotator.email,
                name: annotator.name,
                role: UserRole.ANNOTATOR,
              },
            })
          : existingAnnotator
            ? await prisma.user.update({
                where: { id: existingAnnotator.id },
                data: {
                  name: annotator.name,
                  role: UserRole.ANNOTATOR,
                },
              })
            : await prisma.user.create({
                data: {
                  email: annotator.email,
                  passwordHash: annotatorHash,
                  name: annotator.name,
                  role: UserRole.ANNOTATOR,
                },
              });

    for (const alias of [annotator.name, ...(annotator.aliases ?? [])]) {
      annotatorByAlias.set(alias, user.id);
    }
  }

  return annotatorByAlias;
}

async function seedCases(annotatorByAlias: Map<string, string>) {
  const caseIds = SEEDED_CASES.map((row) => row.caseId);
  const existingRows = await prisma.annotationCase.findMany({
    where: { caseId: { in: caseIds } },
    select: { id: true, caseId: true, annotatorId: true, status: true },
  });
  const existingByCaseId = new Map(existingRows.map((row) => [row.caseId, row]));
  const assignedAt = new Date();

  const toCreate = SEEDED_CASES.filter((row) => !existingByCaseId.has(row.caseId)).map((row) => {
    const project = getProjectTemplate(row.project);
    const annotatorId = row.annotatorName ? annotatorByAlias.get(row.annotatorName) ?? null : null;

    return {
      caseId: row.caseId,
      redbrickProject: row.project,
      guideline: project.guideline,
      scopeOfWork: project.scopeOfWork,
      minMinutesPerCase: project.minMinutesPerCase,
      maxMinutesPerCase: project.maxMinutesPerCase,
      compensationType: project.compensationType,
      compensationAmount: project.compensationAmount,
      annotatorId,
      status: annotatorId ? CaseStatus.ASSIGNED : CaseStatus.AVAILABLE,
      assignedAt: annotatorId ? assignedAt : null,
    };
  });

  if (toCreate.length > 0) {
    await prisma.annotationCase.createMany({ data: toCreate });
  }

  let newlyAssigned = 0;
  for (const row of SEEDED_CASES) {
    if (!row.annotatorName) continue;
    const existing = existingByCaseId.get(row.caseId);
    if (!existing) continue;
    if (existing.annotatorId || existing.status !== CaseStatus.AVAILABLE) continue;

    const annotatorId = annotatorByAlias.get(row.annotatorName);
    if (!annotatorId) continue;

    await prisma.annotationCase.update({
      where: { id: existing.id },
      data: {
        annotatorId,
        status: CaseStatus.ASSIGNED,
        assignedAt,
      },
    });
    newlyAssigned += 1;
  }

  return { created: toCreate.length, newlyAssigned };
}

async function main() {
  const adminHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const annotatorHash = await bcrypt.hash(ANNOTATOR_PASSWORD, 10);

  await upsertAdmin(adminHash);
  const annotatorByAlias = await upsertAnnotators(annotatorHash);
  const caseResult = await seedCases(annotatorByAlias);

  console.log(
    [
      `Seed OK: admin ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`,
      `Annotators: ${TEAM_ANNOTATORS.map((a) => `${a.name} <${a.email}>`).join(", ")}`,
      `Annotator password: ${ANNOTATOR_PASSWORD}`,
      `Cases seeded: created ${caseResult.created}, newly assigned ${caseResult.newlyAssigned}`,
    ].join("\n"),
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
