export enum JobStatus {
  QUEUED = "QUEUED",
  CLAIMED = "CLAIMED",
  RUNNING = "RUNNING",
  COMPLETED = "COMPLETED",
  DEAD_LETTER = "DEAD_LETTER"
}
export enum RetryStrategy {
  FIXED = "FIXED",
  LINEAR = "LINEAR",
  EXPONENTIAL = "EXPONENTIAL"
}
export function calculateRetryDelayMs(strategy: RetryStrategy, baseDelayMs: number, attemptNumber: number) {
  if (strategy === RetryStrategy.FIXED) return baseDelayMs;
  if (strategy === RetryStrategy.LINEAR) return baseDelayMs * attemptNumber;
  return Math.min(baseDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1)), 300000);
}
