export const env = {
  DATABASE_URL: process.env.DATABASE_URL || "",
  JWT_SECRET: process.env.JWT_SECRET || "change-me",
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || "7d",

  // Use Render's PORT if available, otherwise fall back to API_PORT, then 4000
  API_PORT: Number(process.env.PORT || process.env.API_PORT || 4000),

  WORKER_NAME: process.env.WORKER_NAME || "worker-1",
  WORKER_POLL_INTERVAL_MS: Number(process.env.WORKER_POLL_INTERVAL_MS || 3000),
  WORKER_HEARTBEAT_INTERVAL_MS: Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 8000),
  WORKER_CLAIM_BATCH_SIZE: Number(process.env.WORKER_CLAIM_BATCH_SIZE || 5),
  WORKER_LEASE_SECONDS: Number(process.env.WORKER_LEASE_SECONDS || 30)
};

export const log = {
  info: console.log,
  error: console.error,
  warn: console.warn
};