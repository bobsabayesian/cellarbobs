import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, utimesSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  defaultAdvanced,
  defaultBeginner,
  describeAnswers,
  ensureFormatFiles,
  getFormat,
  parseFormat,
  reactionFor,
  readAnswers,
} from "../formats.js";

describe("tasting formats", () => {
  it("writes editable default files and reads them back", () => {
    const dir = join(mkdtempSync(join(tmpdir(), "cb-formats-")), "formats");
    ensureFormatFiles(dir);
    const beginner = JSON.parse(
      readFileSync(join(dir, "beginner.json"), "utf8"),
    );
    expect(beginner.name).toBe("Beginner");
    expect(beginner.id).toBeUndefined(); // the file name is the id
    expect(getFormat("advanced", dir).steps).toHaveLength(4);
  });

  it("picks up edits, and falls back to the default when a file is broken", () => {
    const dir = mkdtempSync(join(tmpdir(), "cb-formats-"));
    const path = join(dir, "beginner.json");
    const { id: _id, ...body } = defaultBeginner();
    void _id;
    body.name = "House style";
    writeFileSync(path, JSON.stringify(body));
    expect(getFormat("beginner", dir).name).toBe("House style");
    writeFileSync(path, "{ nope");
    const later = new Date(Date.now() + 5000);
    utimesSync(path, later, later);
    expect(getFormat("beginner", dir).name).toBe("Beginner");
  });

  it("rejects duplicate keys and fields without options", () => {
    const { id: _id, ...body } = defaultAdvanced();
    void _id;
    const dup = structuredClone(body);
    dup.steps[0].blocks[0].fields.push({ ...dup.steps[0].blocks[0].fields[0] });
    expect(() => parseFormat("advanced", JSON.stringify(dup))).toThrow(
      /duplicate field keys: clarity/,
    );
    const bad = structuredClone(body);
    delete bad.steps[0].blocks[0].fields[0].options;
    expect(() => parseFormat("advanced", JSON.stringify(bad))).toThrow(
      /needs options/,
    );
  });

  it("derives tags and 1-5 structure from answers", () => {
    const read = readAnswers(defaultAdvanced(), {
      p_fruit: ["cherry", "cherry"],
      t_red: ["leather"],
      acidity: "high",
      tannin: "low",
      body: "medium",
      colour: "Red",
      tannin_feel: [],
    });
    expect(read.tags).toEqual(["cherry", "leather"]);
    expect(read.structure).toEqual({ acidity: 5, tannin: 1, body: 3 });
    expect(read.answers).toEqual({
      p_fruit: ["cherry"],
      t_red: ["leather"],
      acidity: "high",
      tannin: "low",
      body: "medium",
      colour: "Red",
    });
    expect(() =>
      readAnswers(defaultAdvanced(), { colour: "Blue: navy" }),
    ).toThrow(/not an option/);
    expect(() => readAnswers(defaultAdvanced(), { acidity: ["high"] })).toThrow(
      /one answer/,
    );
  });

  it("describes answers and maps scores back to reactions", () => {
    expect(
      describeAnswers(defaultAdvanced(), {
        p_fruit: ["cherry"],
        finish: "long",
        tannin_feel: ["grippy", "silky"],
      }),
    ).toEqual(["Tannin feels: grippy, silky", "Finish length: long"]);
    const beginner = defaultBeginner();
    expect(reactionFor(beginner, 95)).toBe("loved it");
    expect(reactionFor(beginner, 72)).toBe("not for me");
    expect(reactionFor(defaultAdvanced(), 95)).toBeNull();
  });
});
