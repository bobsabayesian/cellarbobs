import { existsSync } from "fs";
import { z } from "zod";

export const env = z
  .object({
    NODE_ENV: z.enum(["development", "production", "test"]),
    DATABASE_URL: z.string(),
    DATABASE_TYPE: z.enum(["sqlite", "postgres", "mysql"]),
    BETTER_AUTH_SECRET: z.string(),
    CORS: z.string().optional(),
    APP_VERSION: z.string().default("development"),
    PORT: z.number().default(5000),
    DB_RETRY_INTERVAL: z.coerce.number().default(2000),
    DB_MAX_RETRIES: z.coerce.number().default(30),
    LOG_LEVEL: z
      .enum(["trace", "debug", "info", "warn", "error"])
      .default("info"),
    MCP_ENABLED: z.stringbool().default(false),
    // Sends only import requests (fetching retailer pages) through this
    // proxy: http://, https:// or socks5://. HTTPS_PROXY and NO_PROXY are
    // honoured for import requests when this is unset.
    IMPORT_PROXY_URL: z.url().optional(),
    // JSON file of the quick-tap tags guests pick at tasting parties. Created
    // with the defaults if missing; edits apply without a restart.
    PARTY_TAGS_FILE: z.string().optional(),
    // Folder of tasting format files (beginner.json, advanced.json). Missing
    // files are written with the defaults; edits apply without a restart.
    PARTY_FORMATS_DIR: z.string().optional(),
    // Google Gemini API key for looking up wine data online (scores,
    // reviews, technical details). The lookup is off without it. The model
    // is chosen in System Settings.
    GEMINI_API_KEY: z.string().optional(),
    // Pause between vintages in an admin's "look up all" run, so a big
    // cellar doesn't hit Gemini's rate limits.
    ENRICH_DELAY_MS: z.coerce.number().default(2000),
    UPLOAD_DIR: z
      .string()
      .refine((p) => existsSync(p), {
        message: "UPLOAD_DIR path does not exist",
      })
      .optional(),
  })
  .parse(process.env);
