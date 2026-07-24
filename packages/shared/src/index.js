"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RetryStrategy = exports.JobStatus = void 0;
exports.calculateRetryDelayMs = calculateRetryDelayMs;
var JobStatus;
(function (JobStatus) {
    JobStatus["QUEUED"] = "QUEUED";
    JobStatus["CLAIMED"] = "CLAIMED";
    JobStatus["RUNNING"] = "RUNNING";
    JobStatus["COMPLETED"] = "COMPLETED";
    JobStatus["DEAD_LETTER"] = "DEAD_LETTER";
})(JobStatus || (exports.JobStatus = JobStatus = {}));
var RetryStrategy;
(function (RetryStrategy) {
    RetryStrategy["FIXED"] = "FIXED";
    RetryStrategy["LINEAR"] = "LINEAR";
    RetryStrategy["EXPONENTIAL"] = "EXPONENTIAL";
})(RetryStrategy || (exports.RetryStrategy = RetryStrategy = {}));
function calculateRetryDelayMs(strategy, baseDelayMs, attemptNumber) {
    if (strategy === RetryStrategy.FIXED)
        return baseDelayMs;
    if (strategy === RetryStrategy.LINEAR)
        return baseDelayMs * attemptNumber;
    return Math.min(baseDelayMs * Math.pow(2, Math.max(0, attemptNumber - 1)), 300000);
}
