"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const pool_1 = require("./db/pool");
const worker_1 = require("./jobs/worker");
const queue_1 = require("./jobs/queue");
async function start() {
    const worker = await (0, worker_1.startWorkers)().catch((e) => { console.warn('[Server] Worker error:', e); return null; });
    const server = app_1.app.listen(env_1.env.port, '0.0.0.0', () => process.stdout.write(`API listening on http://0.0.0.0:${env_1.env.port}\n`));
    const shutdown = async () => {
        server.close();
        if (worker)
            await worker.close().catch(() => undefined);
        if (queue_1.jobs)
            await queue_1.jobs.close().catch(() => undefined);
        if (queue_1.redis)
            await queue_1.redis.quit().catch(() => undefined);
        await pool_1.pool.end().catch(() => undefined);
        process.exit(0);
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
start().catch(error => { console.error(error); process.exitCode = 1; });
