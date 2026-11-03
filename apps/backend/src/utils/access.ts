import { AsyncLocalStorage } from "node:async_hooks";
import type { AccessLevel } from "@cellarboss/types";
import { db } from "./database.js";

/**
 * Who can see and change which storages.
 *
 * Access hangs off storages: a user is granted "view" or "edit" on a
 * storage (storageAccess) and gets the same on everything under it. A bottle
 * follows its storage. The admin sees and edits everything, and so does code
 * running with no signed-in user (MCP, import scripts, tests that skip auth).
 *
 * requireAuth runs each request inside runAsViewer, so controllers can call
 * visibleStorageIds() or requireStorage() without being handed the user.
 */

export type Viewer = { id: string; isAdmin: boolean };

/** Thrown when the signed-in user may not see or change something. */
export class AccessError extends Error {
  constructor(
    message: string,
    public status: 403 | 404 = 404,
  ) {
    super(message);
  }
}

type Levels = Map<number, AccessLevel>;
type Store = {
  viewer: Viewer;
  levels?: Promise<Levels>;
  memo: Map<string, Promise<unknown>>;
};

const als = new AsyncLocalStorage<Store>();

export function runAsViewer<T>(viewer: Viewer, fn: () => Promise<T>) {
  return als.run({ viewer, memo: new Map() }, fn);
}

/** The signed-in user for this request, or undefined outside a request. */
export function currentViewer(): Viewer | undefined {
  return als.getStore()?.viewer;
}

const rank = (level: AccessLevel | undefined) =>
  level === "edit" ? 2 : level === "view" ? 1 : 0;

/** Every storage a user can reach, with their level (children inherit). */
export async function computeLevels(userId: string): Promise<Levels> {
  const [storages, grants] = await Promise.all([
    db.selectFrom("storage").select(["id", "parent", "personalFor"]).execute(),
    db
      .selectFrom("storageAccess")
      .select(["storageId", "level"])
      .where("userId", "=", userId)
      .execute(),
  ]);
  const explicit = new Map<number, AccessLevel>(
    grants.map((g) => [g.storageId, g.level]),
  );
  for (const s of storages)
    if (s.personalFor === userId) explicit.set(s.id, "edit");

  const children = new Map<number, number[]>();
  const ids = new Set(storages.map((s) => s.id));
  const roots: number[] = [];
  for (const s of storages) {
    if (s.parent !== null && ids.has(s.parent)) {
      const list = children.get(s.parent) ?? [];
      list.push(s.id);
      children.set(s.parent, list);
    } else roots.push(s.id);
  }

  const result: Levels = new Map();
  const walk = (id: number, inherited: AccessLevel | undefined) => {
    const own = explicit.get(id);
    const level = rank(own) >= rank(inherited) ? own : inherited;
    if (level) result.set(id, level);
    for (const child of children.get(id) ?? []) walk(child, level);
  };
  for (const root of roots) walk(root, undefined);
  return result;
}

async function isAdminUser(userId: string): Promise<boolean> {
  const user = await db
    .selectFrom("user")
    .select("role")
    .where("id", "=", userId)
    .executeTakeFirst();
  return user?.role === "admin";
}

/** Levels for this request's user; null means unrestricted. */
async function viewerLevels(): Promise<Levels | null> {
  const store = als.getStore();
  if (!store || store.viewer.isAdmin) return null;
  store.levels ??= computeLevels(store.viewer.id);
  return store.levels;
}

/** Call after changing grants or storages mid-request. */
export function invalidateAccess() {
  const store = als.getStore();
  if (store) {
    store.levels = undefined;
    store.memo.clear();
  }
}

/** Computes something once per request (cleared by invalidateAccess). */
export function requestMemo<T>(key: string, compute: () => Promise<T>) {
  const store = als.getStore();
  if (!store) return compute();
  let hit = store.memo.get(key) as Promise<T> | undefined;
  if (!hit) store.memo.set(key, (hit = compute()));
  return hit;
}

// An empty IN () list isn't valid on every database; -1 matches no storage.
const NONE = [-1];

/**
 * Storage ids the signed-in user can see, or null for no restriction.
 * Never empty, so it can go straight into `where(..., "in", ids)`.
 */
export async function visibleStorageIds(): Promise<number[] | null> {
  const levels = await viewerLevels();
  if (!levels) return null;
  return levels.size ? [...levels.keys()] : NONE;
}

/** The same for any user (links are shown as their creator sees things). */
export async function visibleStorageIdsFor(
  userId: string,
): Promise<number[] | null> {
  if (await isAdminUser(userId)) return null;
  const levels = await computeLevels(userId);
  return levels.size ? [...levels.keys()] : NONE;
}

export async function storageLevel(
  storageId: number | null,
): Promise<AccessLevel | null> {
  const levels = await viewerLevels();
  if (!levels) return "edit";
  return storageId === null ? null : (levels.get(storageId) ?? null);
}

/**
 * Throws unless the user can see the storage ("view") or change what's in it
 * ("edit"). Something they can't see is reported as not found.
 */
export async function requireStorage(
  storageId: number | null,
  need: AccessLevel,
): Promise<void> {
  const level = await storageLevel(storageId);
  if (!level) throw new AccessError("Not found", 404);
  if (need === "edit" && level === "view")
    throw new AccessError("You have view-only access to this storage", 403);
}

/** The user's personal "unsorted" storage, created the first time it's needed. */
export async function ensurePersonalStorage(userId: string): Promise<number> {
  const existing = await db
    .selectFrom("storage")
    .select("id")
    .where("personalFor", "=", userId)
    .executeTakeFirst();
  if (existing) return existing.id;
  const user = await db
    .selectFrom("user")
    .select("name")
    .where("id", "=", userId)
    .executeTakeFirstOrThrow();
  const created = await db
    .insertInto("storage")
    .values({
      name: `${user.name} (unsorted)`,
      locationId: null,
      parent: null,
      personalFor: userId,
    })
    .returning("id")
    .executeTakeFirstOrThrow();
  await db
    .insertInto("storageAccess")
    .values({
      storageId: created.id,
      userId,
      level: "edit",
      createdAt: new Date().toISOString(),
    })
    .execute();
  invalidateAccess();
  return created.id;
}

/**
 * Where a new or moved bottle goes: the storage given, or, with none, the
 * signed-in user's personal storage (so it is never left where nobody sees
 * it). With no signed-in user a missing storage stays missing.
 */
export async function storageOrPersonal(
  storageId: number | null | undefined,
): Promise<number | null> {
  if (storageId !== null && storageId !== undefined) return storageId;
  const viewer = currentViewer();
  return viewer ? ensurePersonalStorage(viewer.id) : null;
}

/** Gives the signed-in user edit access to something they just created. */
export async function grantCreator(storageId: number): Promise<void> {
  const viewer = currentViewer();
  if (!viewer) return;
  await db
    .insertInto("storageAccess")
    .values({
      storageId,
      userId: viewer.id,
      level: "edit",
      createdAt: new Date().toISOString(),
    })
    .onConflict((oc) => oc.columns(["storageId", "userId"]).doNothing())
    .execute();
  invalidateAccess();
}
