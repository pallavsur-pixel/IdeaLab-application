"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const pool_1 = require("./pool");
async function migrate() {
    await pool_1.pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const dir = node_path_1.default.resolve(process.cwd(), 'migrations');
    const files = (await promises_1.default.readdir(dir)).filter((name) => name.endsWith('.sql')).sort();
    for (const name of files) {
        const { rowCount } = await pool_1.pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [name]);
        if (rowCount)
            continue;
        const sql = await promises_1.default.readFile(node_path_1.default.join(dir, name), 'utf8');
        await (0, pool_1.inTransaction)(async (client) => {
            await client.query(sql);
            await client.query('INSERT INTO schema_migrations(name) VALUES ($1)', [name]);
        });
        process.stdout.write(`Applied ${name}\n`);
    }
}
migrate().then(() => pool_1.pool.end()).catch(async (error) => { console.error(error); await pool_1.pool.end(); process.exitCode = 1; });
