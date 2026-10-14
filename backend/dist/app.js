"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const routes_1 = require("./modules/auth/routes");
const routes_2 = require("./modules/schools/routes");
const routes_3 = require("./modules/requirements/routes");
const routes_4 = require("./modules/admin/routes");
const routes_5 = require("./modules/reports/routes");
const auth_1 = require("./middleware/auth");
const errors_1 = require("./shared/errors");
const pool_1 = require("./db/pool");
const routes_6 = require("./modules/feedback/routes");
const routes_7 = require("./modules/assistant/routes");
exports.app = (0, express_1.default)();
exports.app.disable('x-powered-by');
exports.app.use((req, res, next) => {
    const origin = req.header('origin') || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type,Accept,Origin,X-Requested-With');
    if (req.method === 'OPTIONS')
        return res.status(204).end();
    console.log(`[HTTP] ${req.method} ${req.url} from ${req.ip} (origin: ${req.header('origin')})`);
    next();
});
exports.app.use(express_1.default.json({ limit: '1mb' }));
exports.app.get('/health', async (_req, res) => { try {
    await pool_1.pool.query('SELECT 1');
    res.json({ status: 'ok' });
}
catch {
    res.status(503).json({ status: 'unavailable' });
} });
exports.app.use('/api/v1/auth', routes_1.authRouter);
exports.app.use('/api/v1', routes_2.schoolRouter);
exports.app.use('/api/v1', routes_3.requirementRouter);
exports.app.use('/api/v1', routes_4.adminRouter);
exports.app.use('/api/v1', routes_5.reportRouter);
exports.app.use('/api/v1', routes_6.feedbackRouter);
exports.app.use('/api/v1', routes_7.assistantRouter);
exports.app.get('/api/v1/session', auth_1.authenticate, async (req, res, next) => {
    try {
        const user = await pool_1.pool.query('SELECT user_id, email, role, full_name FROM users WHERE user_id=$1', [req.principal.userId]);
        if (!user.rowCount)
            return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'User not found.' } });
        const u = user.rows[0];
        let school_id = null;
        let org_id = null;
        if (u.role === 'SCHOOL') {
            const s = await pool_1.pool.query('SELECT school_id FROM schools WHERE user_id=$1', [u.user_id]);
            school_id = s.rows[0]?.school_id ?? null;
        }
        else if (u.role === 'NGO') {
            const o = await pool_1.pool.query('SELECT org_id FROM organizations WHERE user_id=$1', [u.user_id]);
            org_id = o.rows[0]?.org_id ?? null;
        }
        res.json({
            user_id: u.user_id,
            email: u.email,
            role: u.role,
            full_name: u.full_name,
            school_id,
            org_id,
        });
    }
    catch (e) {
        next(e);
    }
});
exports.app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }));
exports.app.use(errors_1.errorHandler);
