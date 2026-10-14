"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobs = exports.redis = void 0;
exports.enqueueRecompute = enqueueRecompute;
const bullmq_1 = require("bullmq");
const ioredis_1 = __importDefault(require("ioredis"));
const env_1 = require("../config/env");
exports.redis = null;
exports.jobs = null;
if (env_1.env.redisUrl) {
    try {
        exports.redis = new ioredis_1.default(env_1.env.redisUrl, {
            maxRetriesPerRequest: null,
            lazyConnect: true,
            enableOfflineQueue: false,
        });
        exports.redis.on('error', (err) => {
            // Handle connection error gracefully without terminating Node process
            console.warn('[Redis] Connection warning:', err.message);
        });
        exports.jobs = new bullmq_1.Queue('science-resource-gap', { connection: exports.redis });
    }
    catch (e) {
        console.warn('[Redis] Could not initialize Redis queue:', e);
        exports.redis = null;
        exports.jobs = null;
    }
}
async function enqueueRecompute(kind, categoryId) {
    if (!exports.jobs) {
        return;
    }
    try {
        return await exports.jobs.add('recompute-priority', { kind, categoryId }, { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 100, removeOnFail: 500 });
    }
    catch (err) {
        console.warn('[Queue] Could not enqueue recompute job:', err);
    }
}
