// Read at runtime on purpose: `bun build` inlines the literal
// `process.env.NODE_ENV` at bundle time, and the Docker build stage doesn't
// set it, which silently compiled production-only code (rate limiting, the
// JWT secret check) out of the production bundle.
const { env } = process;

export const IS_PRODUCTION = env.NODE_ENV === "production";
