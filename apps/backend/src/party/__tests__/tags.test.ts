import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync, utimesSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  DEFAULT_TAG_GROUPS,
  allowedTags,
  ensureTagsFile,
  getTagGroups,
  parseTagGroups,
} from "../tags.js";

describe("tasting party tags file", () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "cb-tags-"));
  });

  it("writes the defaults when the file is missing, then reads it", () => {
    const path = join(dir, "tasting-tags.json");
    ensureTagsFile(path);
    expect(JSON.parse(readFileSync(path, "utf8"))).toEqual(DEFAULT_TAG_GROUPS);
    expect(getTagGroups(path)).toEqual(DEFAULT_TAG_GROUPS);
  });

  it("picks up edits without a restart", () => {
    const path = join(dir, "tasting-tags.json");
    writeFileSync(path, JSON.stringify({ fruit: ["cherry"] }));
    expect(getTagGroups(path)).toEqual({ fruit: ["cherry"] });
    writeFileSync(
      path,
      JSON.stringify({ fruit: ["cherry", "Bing cherry"], funk: ["barnyard"] }),
    );
    const later = new Date(Date.now() + 5000);
    utimesSync(path, later, later);
    expect(getTagGroups(path)).toEqual({
      fruit: ["cherry", "Bing cherry"],
      funk: ["barnyard"],
    });
    expect(allowedTags(path).has("barnyard")).toBe(true);
    expect(allowedTags(path).has("tar")).toBe(false);
  });

  it("falls back to the defaults when the file is broken", () => {
    const path = join(dir, "tasting-tags.json");
    writeFileSync(path, "{ not json");
    expect(getTagGroups(path)).toEqual(DEFAULT_TAG_GROUPS);
    writeFileSync(path, JSON.stringify({ fruit: [] }));
    const later = new Date(Date.now() + 10000);
    utimesSync(path, later, later);
    expect(getTagGroups(path)).toEqual(DEFAULT_TAG_GROUPS);
  });

  it("validates and de-duplicates", () => {
    expect(
      parseTagGroups(
        JSON.stringify({ a: ["Tar", "tar", "rose"], b: ["ROSE", "x"] }),
      ),
    ).toEqual({
      a: ["Tar", "rose"],
      b: ["x"],
    });
    expect(() => parseTagGroups(JSON.stringify(["cherry"]))).toThrow();
    expect(() => parseTagGroups(JSON.stringify({}))).toThrow(/No tag groups/);
  });
});
