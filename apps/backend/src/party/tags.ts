import { existsSync, readFileSync, statSync, writeFileSync } from "fs";
import { dirname } from "path";
import { z } from "zod";
import { TASTING_TAG_GROUPS } from "@cellarboss/validators";
import { env } from "@utils/env.js";
import { logger } from "@utils/logger.js";

/**
 * The quick-tap tags guests pick at tasting parties ("cherry", "tar", ...),
 * grouped for display. They come from a JSON file (PARTY_TAGS_FILE) so the
 * host can edit them:
 *
 *   {
 *     "fruit": ["cherry", "plum"],
 *     "earth": ["tar", "leather"]
 *   }
 *
 * Group names are shown as headings, in file order. The file is re-read
 * when it changes, so edits apply to the next request. If it's missing or
 * invalid the built-in defaults are used and the problem is logged.
 */

export type TagGroups = Record<string, string[]>;

const tagGroupsSchema = z
  .record(
    z.string().trim().min(1).max(40),
    z.array(z.string().trim().min(1).max(40)).min(1).max(60),
  )
  .refine((groups) => Object.keys(groups).length > 0, "No tag groups")
  .refine(
    (groups) => Object.keys(groups).length <= 20,
    "At most 20 tag groups",
  );

export const DEFAULT_TAG_GROUPS: TagGroups = Object.fromEntries(
  Object.entries(TASTING_TAG_GROUPS).map(([group, tags]) => [group, [...tags]]),
);

let cache: { path: string; mtimeMs: number; groups: TagGroups } | null = null;

/** Parses and validates a tags file's contents. Throws with a readable reason. */
export function parseTagGroups(text: string): TagGroups {
  const result = tagGroupsSchema.safeParse(JSON.parse(text));
  if (!result.success)
    throw new Error(
      result.error.issues
        .map((i) => `${i.path.join(".") || "file"}: ${i.message}`)
        .join("; "),
    );
  // Drop duplicate tags (case-insensitively) while keeping order.
  const seen = new Set<string>();
  return Object.fromEntries(
    Object.entries(result.data).map(([group, tags]) => [
      group,
      tags.filter((tag) => {
        const key = tag.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      }),
    ]),
  );
}

/** Writes the defaults to the tags file if it doesn't exist yet. */
export function ensureTagsFile(path = env.PARTY_TAGS_FILE): void {
  if (!path || existsSync(path)) return;
  try {
    if (!existsSync(dirname(path))) return;
    writeFileSync(path, JSON.stringify(DEFAULT_TAG_GROUPS, null, 2) + "\n");
    logger.withContext({ path }).info("Wrote default tasting party tags");
  } catch (err) {
    logger
      .withError(err as Error)
      .warn("Could not write tasting party tags file");
  }
}

/** The current tag groups: the file's if valid, otherwise the defaults. */
export function getTagGroups(path = env.PARTY_TAGS_FILE): TagGroups {
  if (!path || !existsSync(path)) return DEFAULT_TAG_GROUPS;
  try {
    const { mtimeMs } = statSync(path);
    if (cache && cache.path === path && cache.mtimeMs === mtimeMs)
      return cache.groups;
    const groups = parseTagGroups(readFileSync(path, "utf8"));
    cache = { path, mtimeMs, groups };
    return groups;
  } catch (err) {
    logger
      .withContext({ path, reason: (err as Error).message })
      .warn("Invalid tasting party tags file; using the defaults");
    return DEFAULT_TAG_GROUPS;
  }
}

/** Every allowed tag, lower-cased, for validating reviews. */
export function allowedTags(path?: string): Set<string> {
  return new Set(
    Object.values(getTagGroups(path))
      .flat()
      .map((t) => t.toLowerCase()),
  );
}
