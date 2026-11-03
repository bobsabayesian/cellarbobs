import type { Hono } from "hono";
import type { MockState } from "../index";
import type { TastingFormat } from "@cellarboss/types";
import { nextId } from "../ids";
import {
  createTastingNoteSchema,
  updateTastingNoteSchema,
} from "@cellarboss/validators";

/** Small stand-ins for the backend's beginner and advanced format files. */
const FORMATS: TastingFormat[] = [
  {
    id: "beginner",
    name: "Beginner",
    rating: {
      kind: "reaction",
      options: [
        { label: "loved it", score: 95 },
        { label: "liked it", score: 80 },
        { label: "not for me", score: 50 },
      ],
    },
    steps: [
      {
        id: "taste",
        title: "Taste",
        blocks: [
          {
            id: "palate",
            title: "In your mouth",
            fields: [
              {
                key: "tannin",
                label: "Tannin",
                kind: "scale",
                options: ["soft", "medium", "grippy"],
              },
            ],
          },
        ],
      },
    ],
  },
  {
    id: "advanced",
    name: "Advanced",
    rating: { kind: "score" },
    steps: [
      {
        id: "look",
        title: "Look",
        blocks: [
          {
            id: "appearance",
            title: "Appearance",
            fields: [
              {
                key: "clarity",
                label: "Clarity",
                kind: "scale",
                options: ["hazy", "clear", "brilliant"],
              },
            ],
          },
        ],
      },
      {
        id: "palate",
        title: "Palate",
        blocks: [
          {
            id: "structure",
            title: "Structure",
            fields: [
              {
                key: "body",
                label: "Body",
                kind: "scale",
                options: ["light", "medium", "full"],
              },
            ],
          },
        ],
      },
    ],
  },
];

export function registerTastingNoteRoutes(app: Hono, state: MockState) {
  app.get("/api/tasting-note/formats", (c) => c.json(FORMATS));

  app.get("/api/tasting-note", (c) => {
    return c.json(state.tastingNotes);
  });

  app.get("/api/tasting-note/vintage/:vintageId", (c) => {
    const vintageId = Number(c.req.param("vintageId"));
    const notes = state.tastingNotes.filter((n) => n.vintageId === vintageId);
    return c.json(notes);
  });

  app.get("/api/tasting-note/wine/:wineId", (c) => {
    const wineId = Number(c.req.param("wineId"));
    const vintageIds = new Set(
      state.vintages.filter((v) => v.wineId === wineId).map((v) => v.id),
    );
    const notes = state.tastingNotes.filter((n) => vintageIds.has(n.vintageId));
    return c.json(notes);
  });

  app.get("/api/tasting-note/:id", (c) => {
    const id = Number(c.req.param("id"));
    const note = state.tastingNotes.find((n) => n.id === id);
    if (!note) return c.json({ error: "Not found" }, 404);
    return c.json(note);
  });

  app.post("/api/tasting-note", async (c) => {
    const body = await c.req.json();
    const result = createTastingNoteSchema.safeParse(body);
    if (!result.success) return c.json({ error: result.error.issues }, 400);
    const note = {
      id: nextId(state.tastingNotes),
      ...result.data,
      authorId: state.session?.user.id ?? "unknown",
      author: state.session?.user.name ?? "Unknown",
      date: new Date().toISOString(),
    };
    state.tastingNotes.push(note);
    return c.json(note, 201);
  });

  app.put("/api/tasting-note/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const body = await c.req.json();
    const result = updateTastingNoteSchema.safeParse(body);
    if (!result.success) return c.json({ error: result.error.issues }, 400);
    const idx = state.tastingNotes.findIndex((n) => n.id === id);
    if (idx === -1) return c.json({ error: "Not found" }, 404);
    state.tastingNotes[idx] = { ...state.tastingNotes[idx], ...result.data };
    return c.json(state.tastingNotes[idx]);
  });

  app.delete("/api/tasting-note/:id", (c) => {
    const id = Number(c.req.param("id"));
    const idx = state.tastingNotes.findIndex((n) => n.id === id);
    if (idx === -1) return c.json({ error: "Not found" }, 404);
    state.tastingNotes.splice(idx, 1);
    return c.json(true);
  });
}
