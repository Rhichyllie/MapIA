import { z } from "zod";

const strictBooleanEnv = z
  .enum(["true", "false"])
  .transform((value) => value === "true");

const serverEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  NEXTAUTH_URL: z.string().url().default("http://localhost:3000"),
  NEXTAUTH_SECRET: z.string().min(8).default("dev-only-nextauth-secret"),
  AUTH_MODE: z.enum(["development", "oidc"]).optional(),
  AUTH_OIDC_ISSUER_URL: z.string().url().optional(),
  AUTH_OIDC_CLIENT_ID: z.string().min(1).optional(),
  AUTH_OIDC_CLIENT_SECRET: z.string().min(1).optional(),
  AUTH_OIDC_PROVIDER_NAME: z.string().min(1).default("Single Sign-On"),
  AUTH_OIDC_SCOPE: z.string().min(1).default("openid profile email"),
  TELEMETRY_HASH_SALT: z
    .string()
    .min(8)
    .optional(),
  DEV_LOGIN_EMAIL: z.string().email().default("admin@mapia.local"),
  DEV_LOGIN_PASSWORD: z.string().min(6).default("mapia123"),
  APP_RELEASE_VERSION: z.string().min(1).default("dev"),
  APP_SERVICE_NAME: z.string().min(1).default("mapia-web"),
  CREATION_TRANSITION_TELEMETRY_ENABLED: strictBooleanEnv
    .default(true),
  TELEMETRY_SINK_TIMEOUT_MS: z.coerce.number().int().positive().default(150),
  TELEMETRY_SINK_FALLBACK_COOLDOWN_MS: z.coerce
    .number()
    .int()
    .nonnegative()
    .default(30000),
  TELEMETRY_GATE_EVALUATION_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30000),
  CREATION_TRANSITION_TELEMETRY_LOG_THROTTLE_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(60000),
  INTERNAL_OBSERVABILITY_ALLOWED_IDENTITIES: z
    .string()
    .default("admin@mapia.local"),
  DATABASE_URL: z.string().url().optional(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cachedServerEnv: ServerEnv | null = null;

export function getServerEnv(): ServerEnv {
  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = serverEnvSchema.safeParse(process.env);

  if (!parsed.success) {
    throw new Error(
      `Invalid environment variables: ${parsed.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ")}`,
    );
  }

  cachedServerEnv = parsed.data;
  return parsed.data;
}
