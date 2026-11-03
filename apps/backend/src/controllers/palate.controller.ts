import type {
  GuessAccuracy,
  PalateProfile,
  TasterCalibration,
} from "@cellarboss/types";
import { db } from "@utils/database.js";
import { foldKey } from "../import/normalise/text.js";
import {
  guessAccuracy,
  palateProfile,
  tasterCalibration,
  type ProfileFilter,
} from "../palate/stats.js";
import { reviewRows } from "./parties.controller.js";

/**
 * Palate profile for one host. Rows from other hosts' parties are left out,
 * so "isHost" in the stats means this user.
 */
async function rowsFor(userId?: string) {
  const rows = await reviewRows();
  if (!userId) return rows;
  const hostParties = new Set(
    (
      await db
        .selectFrom("tastingParty")
        .select("id")
        .where("hostUserId", "=", userId)
        .execute()
    ).map((p) => p.id),
  );
  return rows.filter((r) => hostParties.has(r.partyId));
}

export async function profile(
  userId?: string,
  filter: ProfileFilter = {},
): Promise<PalateProfile> {
  return palateProfile(await rowsFor(userId), filter);
}

export async function calibration(
  userId?: string,
): Promise<TasterCalibration[]> {
  return tasterCalibration(await rowsFor(userId));
}

export async function accuracy(
  userId?: string,
  taster?: string,
): Promise<GuessAccuracy[]> {
  return guessAccuracy(
    await rowsFor(userId),
    taster ? foldKey(taster) : undefined,
  );
}

export async function summary(userId: string) {
  const rows = await rowsFor(userId);
  return {
    profile: palateProfile(rows),
    calibration: tasterCalibration(rows),
    hostGuessAccuracy: guessAccuracy(rows.filter((r) => r.isHost)),
  };
}
