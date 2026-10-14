"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
exports.inTransaction = inTransaction;
const pg_1 = require("pg");
const env_1 = require("../config/env");
const isRemote = env_1.env.databaseUrl.includes('supabase') || !env_1.env.databaseUrl.includes('localhost');
exports.pool = new pg_1.Pool({
    connectionString: env_1.env.databaseUrl,
    max: 20,
    ssl: isRemote ? { rejectUnauthorized: false } : undefined,
});
async function inTransaction(fn) {
    const client = await exports.pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
}
