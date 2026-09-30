import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseCaseStudyHistoryTable,
  stagesFromJson,
  stagesToJson,
} from "../src/lib/case-study-history";

describe("case-study-history", () => {
  const sample = [
    "\t\tPreLabeling Stage\t\t\t\t\t\tLabel Stage\t\t\t\t\t\tReview 1\t\t\t\t\t",
    [
      "Study ID",
      "RedBrick Stage",
      "Batch ID 1",
      "Annotator 1",
      "Date Assigned 1",
      "Date Completed 1",
      "Status 1",
      "Notes",
      "Batch ID 2",
      "Annotator 2",
      "Date Assigned 2",
      "Date Completed 2",
      "Status 2",
      "Notes",
      "Batch ID 3",
      "Annotator 3",
      "Date Assigned 3",
      "Date Completed 3",
      "Status 3",
      "Notes",
    ].join("\t"),
    [
      "asi-708cbd32-1111-2222-3333-444444444444",
      "Label",
      "B1",
      "ann1",
      "2024-01-01",
      "2024-01-02",
      "Done",
      "pre note",
      "B2",
      "ann2",
      "2024-02-01",
      "2024-02-02",
      "In Progress",
      "label note",
      "B3",
      "ann3",
      "2024-03-01",
      "",
      "Pending",
      "review note",
    ].join("\t"),
  ].join("\n");

  it("parses stage groups keyed by study id", () => {
    const rows = parseCaseStudyHistoryTable(sample);
    assert.equal(rows.length, 1);
    const row = rows[0]!;
    assert.equal(row.studyId, "asi-708cbd32-1111-2222-3333-444444444444");
    assert.equal(row.studyIdNorm, "708cbd32-1111-2222-3333-444444444444");
    assert.equal(row.redbrickStage, "Label");
    assert.equal(row.stages.length, 3);
    assert.equal(row.stages[0]!.stage, "PreLabeling Stage");
    assert.equal(row.stages[0]!.batchId, "B1");
    assert.equal(row.stages[0]!.notes, "pre note");
    assert.equal(row.stages[1]!.stage, "Label Stage");
    assert.equal(row.stages[1]!.annotator, "ann2");
    assert.equal(row.stages[1]!.notes, "label note");
    assert.equal(row.stages[2]!.stage, "Review 1");
    assert.equal(row.stages[2]!.status, "Pending");
    assert.equal(row.stages[2]!.notes, "review note");
  });

  it("uses default stage names without super-header", () => {
    const text = [
      "Study ID,RedBrick Stage,Batch ID 1,Annotator 1,Date Assigned 1,Date Completed 1,Status 1,Notes,Batch ID 2,Annotator 2,Date Assigned 2,Date Completed 2,Status 2,Notes",
      "ABC-001,Label,b1,a1,d1,d2,ok,n1,b2,a2,d3,d4,done,n2",
    ].join("\n");
    const rows = parseCaseStudyHistoryTable(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.stages[0]!.stage, "PreLabeling Stage");
    assert.equal(rows[0]!.stages[1]!.stage, "Label Stage");
    assert.equal(rows[0]!.stages[1]!.notes, "n2");
  });

  it("dedupes by normalized study id (last wins)", () => {
    const text = [
      "Study ID\tBatch ID 1\tAnnotator 1\tStatus 1\tNotes",
      "asi-aaa\tB1\tA1\tDone\told",
      "AAA\tB2\tA2\tDone\tnew",
    ].join("\n");
    const rows = parseCaseStudyHistoryTable(text);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.stages[0]!.notes, "new");
    assert.equal(rows[0]!.stages[0]!.batchId, "B2");
  });

  it("round-trips stages json", () => {
    const stages = parseCaseStudyHistoryTable(sample)[0]!.stages;
    const again = stagesFromJson(stagesToJson(stages));
    assert.deepEqual(again, stages);
  });
});
