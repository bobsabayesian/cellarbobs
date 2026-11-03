import { auth } from "@utils/auth.js";
import { logger } from "@utils/logger.js";
import { runAsViewer } from "@utils/access.js";
import type { Context, Next } from "hono";

export async function requireAuth(c: Context, next: Next) {
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });

    if (!session) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    c.set("user", session.user);
    c.set("session", session.session);
  } catch (err) {
    logger.withError(err as Error).warn("Auth session check failed");
    return c.json({ error: "Unauthorized" }, 401);
  }
  // Outside the try so errors from the route itself aren't reported as 401.
  const user = c.get("user") as { id: string; role?: string | null };
  await runAsViewer({ id: user.id, isAdmin: user.role === "admin" }, () =>
    next(),
  );
}
