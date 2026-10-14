"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("./pool");
async function seed() {
    const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD;
    const fullName = process.env.ADMIN_NAME;
    if (!email || !password || !fullName || password.length < 10 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
        throw new Error('Set ADMIN_EMAIL, ADMIN_NAME and a 10+ character ADMIN_PASSWORD containing a letter and a digit');
    }
    await (0, pool_1.inTransaction)(async (client) => {
        const exists = await client.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
        if (exists.rowCount)
            throw new Error('An account already exists for ADMIN_EMAIL');
        const hash = await bcryptjs_1.default.hash(password, 12);
        const result = await client.query("INSERT INTO users(email,password_hash,role,full_name) VALUES($1,$2,'ADMIN',$3) RETURNING user_id", [email, hash, fullName]);
        await client.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('User',$1,'CREATE',$1,jsonb_build_object('role','ADMIN','email',$2))", [result.rows[0].user_id, email]);
        await client.query(`INSERT INTO weight_configs(severity_weight,importance_weight,students_weight,alternative_weight,condition_weight,critical_threshold,high_threshold,medium_threshold,is_active,created_by)
      SELECT 0.350,0.250,0.200,0.100,0.100,80,60,40,true,$1 WHERE NOT EXISTS(SELECT 1 FROM weight_configs)`, [result.rows[0].user_id]);
    });
    process.stdout.write('Admin account created.\n');
}
seed().then(() => pool_1.pool.end()).catch(async (error) => { console.error(error); await pool_1.pool.end(); process.exitCode = 1; });
