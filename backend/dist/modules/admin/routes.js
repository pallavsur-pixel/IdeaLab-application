"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("../../db/pool");
const auth_1 = require("../../middleware/auth");
const errors_1 = require("../../shared/errors");
const queue_1 = require("../../jobs/queue");
const pagination_1 = require("../../shared/pagination");
exports.adminRouter = (0, express_1.Router)();
exports.adminRouter.use(auth_1.authenticate);
exports.adminRouter.get('/resource-categories', async (req, res, next) => { try {
    const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
    const [rows, count] = await Promise.all([pool_1.pool.query('SELECT * FROM resource_categories ORDER BY name LIMIT $1 OFFSET $2', [pageSize, offset]), pool_1.pool.query('SELECT count(*) FROM resource_categories')]);
    res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].count));
}
catch (e) {
    next(e);
} });
exports.adminRouter.post('/resource-categories', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const p = zod_1.z.object({ name: zod_1.z.string().min(1).max(100), importance_weight: zod_1.z.number().int().min(0).max(100) }).parse(req.body);
    const r = await (0, pool_1.inTransaction)(async (c) => { const created = await c.query('INSERT INTO resource_categories(name,importance_weight) VALUES($1,$2) RETURNING *', [p.name, p.importance_weight]); await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('ResourceCategory',$1,'CREATE',$2,to_jsonb($3::json))", [created.rows[0].category_id, req.principal.userId, JSON.stringify(p)]); return created.rows[0]; });
    res.status(201).json(r);
}
catch (e) {
    next(e);
} });
exports.adminRouter.patch('/resource-categories/:id', (0, auth_1.allow)('ADMIN'), async (req, res, next) => {
    try {
        const p = zod_1.z.object({ name: zod_1.z.string().min(1).max(100).optional(), importance_weight: zod_1.z.number().int().min(0).max(100).optional(), is_active: zod_1.z.boolean().optional() }).refine(v => Object.keys(v).length > 0).parse(req.body);
        const row = await (0, pool_1.inTransaction)(async (c) => {
            const old = await c.query('SELECT * FROM resource_categories WHERE category_id=$1 FOR UPDATE', [req.params.id]);
            if (!old.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Resource category not found.');
            const next = { ...old.rows[0], ...p };
            await c.query('UPDATE resource_categories SET name=$2,importance_weight=$3,is_active=$4 WHERE category_id=$1', [req.params.id, next.name, next.importance_weight, next.is_active]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('ResourceCategory',$1,'UPDATE',$2,$3::jsonb,$4::jsonb)", [req.params.id, req.principal.userId, JSON.stringify({ name: old.rows[0].name, importance_weight: old.rows[0].importance_weight, is_active: old.rows[0].is_active }), JSON.stringify({ name: next.name, importance_weight: next.importance_weight, is_active: next.is_active })]);
            return next;
        });
        if (p.importance_weight !== undefined)
            await (0, queue_1.enqueueRecompute)('category', req.params.id);
        res.json(row);
    }
    catch (e) {
        next(e);
    }
});
exports.adminRouter.get('/resources', async (req, res, next) => { try {
    if (typeof req.query.category_id !== 'string')
        throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'category_id is required.');
    const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
    const [rows, count] = await Promise.all([pool_1.pool.query('SELECT * FROM resources WHERE category_id=$1 ORDER BY name LIMIT $2 OFFSET $3', [req.query.category_id, pageSize, offset]), pool_1.pool.query('SELECT count(*) FROM resources WHERE category_id=$1', [req.query.category_id])]);
    res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].count));
}
catch (e) {
    next(e);
} });
exports.adminRouter.post('/resources', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const p = zod_1.z.object({ category_id: zod_1.z.string().uuid(), name: zod_1.z.string().min(1).max(150), unit_of_measure: zod_1.z.string().min(1).max(30) }).parse(req.body);
    const r = await (0, pool_1.inTransaction)(async (c) => { const created = await c.query('INSERT INTO resources(category_id,name,unit_of_measure) VALUES($1,$2,$3) RETURNING *', [p.category_id, p.name, p.unit_of_measure]); await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('Resource',$1,'CREATE',$2,to_jsonb($3::json))", [created.rows[0].resource_id, req.principal.userId, JSON.stringify(p)]); return created.rows[0]; });
    res.status(201).json(r);
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/weight-configs', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
    const [rows, count] = await Promise.all([pool_1.pool.query('SELECT * FROM weight_configs ORDER BY created_at DESC LIMIT $1 OFFSET $2', [pageSize, offset]), pool_1.pool.query('SELECT count(*) FROM weight_configs')]);
    res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].count));
}
catch (e) {
    next(e);
} });
const configBody = zod_1.z.object({ severity_weight: zod_1.z.number().min(0).max(1), importance_weight: zod_1.z.number().min(0).max(1), students_weight: zod_1.z.number().min(0).max(1), alternative_weight: zod_1.z.number().min(0).max(1), condition_weight: zod_1.z.number().min(0).max(1), critical_threshold: zod_1.z.number().int().min(0).max(100), high_threshold: zod_1.z.number().int().min(0).max(100), medium_threshold: zod_1.z.number().int().min(0).max(100) });
exports.adminRouter.post('/weight-configs', (0, auth_1.allow)('ADMIN'), async (req, res, next) => {
    try {
        const p = configBody.parse(req.body);
        const sum = p.severity_weight + p.importance_weight + p.students_weight + p.alternative_weight + p.condition_weight;
        if (Math.abs(sum - 1) > .001 || !(p.critical_threshold > p.high_threshold && p.high_threshold > p.medium_threshold))
            throw new errors_1.ApiError(400, 'INVALID_WEIGHT_CONFIG', 'Weights must sum to 1.000 (+/- 0.001) and thresholds must descend.');
        const result = await (0, pool_1.inTransaction)(async (c) => {
            const r = await c.query(`INSERT INTO weight_configs(severity_weight,importance_weight,students_weight,alternative_weight,condition_weight,critical_threshold,high_threshold,medium_threshold,created_by)
  VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [p.severity_weight, p.importance_weight, p.students_weight, p.alternative_weight, p.condition_weight, p.critical_threshold, p.high_threshold, p.medium_threshold, req.principal.userId]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('WeightConfig',$1,'CREATE',$2,to_jsonb($3::json))", [r.rows[0].config_id, req.principal.userId, JSON.stringify(p)]);
            return r.rows[0];
        });
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.adminRouter.patch('/weight-configs/:id/activate', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const p = zod_1.z.object({ expected_version: zod_1.z.number().int().positive() }).parse(req.body);
    const r = await (0, pool_1.inTransaction)(async (c) => { const target = await c.query('SELECT * FROM weight_configs WHERE config_id=$1 FOR UPDATE', [req.params.id]); if (!target.rowCount)
        throw new errors_1.ApiError(404, 'NOT_FOUND', 'Weight configuration not found.'); if (Number(target.rows[0].version) !== p.expected_version)
        throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Weight configuration changed since it was read.', { current: target.rows[0] }); const current = await c.query('SELECT config_id FROM weight_configs WHERE is_active=true FOR UPDATE'); await c.query('UPDATE weight_configs SET is_active=false,version=version+1 WHERE is_active=true'); await c.query('UPDATE weight_configs SET is_active=true,version=version+1 WHERE config_id=$1', [req.params.id]); await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('WeightConfig',$1,'ACTIVATE',$2,jsonb_build_object('active_config',$3),jsonb_build_object('active_config',$1))", [req.params.id, req.principal.userId, current.rows[0]?.config_id ?? null]); return (await c.query('SELECT * FROM weight_configs WHERE config_id=$1', [req.params.id])).rows[0]; });
    await (0, queue_1.enqueueRecompute)('all');
    res.json(r);
}
catch (e) {
    next(e);
} });
exports.adminRouter.patch('/organizations/:id/verify', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const p = zod_1.z.object({ status: zod_1.z.enum(['VERIFIED', 'REJECTED']) }).parse(req.body);
    const r = await (0, pool_1.inTransaction)(async (c) => { const old = await c.query('SELECT verification_status FROM organizations WHERE org_id=$1 FOR UPDATE', [req.params.id]); if (!old.rowCount)
        throw new errors_1.ApiError(404, 'NOT_FOUND', 'Organization not found.'); await c.query('UPDATE organizations SET verification_status=$2 WHERE org_id=$1', [req.params.id, p.status]); await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Organization',$1,'VERIFY',$2,jsonb_build_object('verification_status',$3),jsonb_build_object('verification_status',$4))", [req.params.id, req.principal.userId, old.rows[0].verification_status, p.status]); return (await c.query('SELECT * FROM organizations WHERE org_id=$1', [req.params.id])).rows[0]; });
    res.json(r);
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/audit-logs', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
    const [rows, count] = await Promise.all([pool_1.pool.query('SELECT * FROM audit_logs ORDER BY performed_at DESC LIMIT $1 OFFSET $2', [pageSize, offset]), pool_1.pool.query('SELECT count(*) FROM audit_logs')]);
    res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].count));
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/users', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
    const [rows, count] = await Promise.all([pool_1.pool.query('SELECT user_id,email,role,full_name,phone,is_active,last_login_at,created_at FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2', [pageSize, offset]), pool_1.pool.query('SELECT count(*) FROM users')]);
    res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].count));
}
catch (e) {
    next(e);
} });
exports.adminRouter.get('/organizations', (0, auth_1.allow)('ADMIN'), async (req, res, next) => { try {
    const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
    const [rows, count] = await Promise.all([pool_1.pool.query('SELECT * FROM organizations ORDER BY created_at DESC LIMIT $1 OFFSET $2', [pageSize, offset]), pool_1.pool.query('SELECT count(*) FROM organizations')]);
    res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].count));
}
catch (e) {
    next(e);
} });
exports.adminRouter.post('/users', (0, auth_1.allow)('ADMIN'), async (req, res, next) => {
    try {
        const p = zod_1.z.object({
            email: zod_1.z.string().email().max(255),
            password: zod_1.z.string().min(8),
            full_name: zod_1.z.string().min(1).max(150),
            phone: zod_1.z.string().regex(/^\+[1-9]\d{1,14}$/).optional(),
            role: zod_1.z.enum(['SCHOOL', 'NGO', 'FIELD_COORDINATOR', 'ADMIN']),
            school_name: zod_1.z.string().optional(),
            org_name: zod_1.z.string().optional()
        }).parse(req.body);
        const r = await (0, pool_1.inTransaction)(async (c) => {
            const user = await c.query('INSERT INTO users(email,password_hash,role,full_name,phone) VALUES(lower($1),$2,$3,$4,$5) RETURNING user_id,email,role,full_name,phone,is_active', [p.email, await bcryptjs_1.default.hash(p.password, 12), p.role, p.full_name, p.phone ?? null]);
            const uid = user.rows[0].user_id;
            if (p.role === 'SCHOOL') {
                await c.query('INSERT INTO schools(user_id,school_name,school_type,district,state,student_strength_total) VALUES($1,$2,$3,$4,$5,$6)', [uid, p.school_name || `${p.full_name}'s School`, 'GOVERNMENT', 'Bangalore', 'Karnataka', 450]);
            }
            else if (p.role === 'NGO') {
                await c.query('INSERT INTO organizations(user_id,org_name,verification_status) VALUES($1,$2,$3)', [uid, p.org_name || `${p.full_name}'s Foundation`, 'VERIFIED']);
            }
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('User',$1,'CREATE',$2,jsonb_build_object('role',$3,'email',$4))", [uid, req.principal.userId, p.role, p.email]);
            return user.rows[0];
        });
        res.status(201).json(r);
    }
    catch (e) {
        next(e);
    }
});
exports.adminRouter.patch('/users/:id', (0, auth_1.allow)('ADMIN'), async (req, res, next) => {
    try {
        const p = zod_1.z.object({ role: zod_1.z.enum(['SCHOOL', 'NGO', 'ADMIN', 'FIELD_COORDINATOR']).optional(), is_active: zod_1.z.boolean().optional() }).refine(v => Object.keys(v).length > 0).parse(req.body);
        const r = await (0, pool_1.inTransaction)(async (c) => { const old = await c.query('SELECT user_id,role,is_active FROM users WHERE user_id=$1 FOR UPDATE', [req.params.id]); if (!old.rowCount)
            throw new errors_1.ApiError(404, 'NOT_FOUND', 'User not found.'); const nextRole = p.role ?? old.rows[0].role, nextActive = p.is_active ?? old.rows[0].is_active; await c.query('UPDATE users SET role=$2,is_active=$3 WHERE user_id=$1', [req.params.id, nextRole, nextActive]); if (p.role)
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('User',$1,'ROLE_CHANGE',$2,jsonb_build_object('role',$3),jsonb_build_object('role',$4))", [req.params.id, req.principal.userId, old.rows[0].role, nextRole]); if (p.is_active !== undefined)
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('User',$1,'ACTIVE_CHANGE',$2,jsonb_build_object('is_active',$3),jsonb_build_object('is_active',$4))", [req.params.id, req.principal.userId, old.rows[0].is_active, nextActive]); return (await c.query('SELECT user_id,email,role,full_name,phone,is_active,last_login_at FROM users WHERE user_id=$1', [req.params.id])).rows[0]; });
        res.json(r);
    }
    catch (e) {
        next(e);
    }
});
exports.adminRouter.post('/field-coordinators/:id/schools/:schoolId', (0, auth_1.allow)('ADMIN'), async (req, res, next) => {
    try {
        await (0, pool_1.inTransaction)(async (c) => { const user = await c.query("SELECT 1 FROM users WHERE user_id=$1 AND role='FIELD_COORDINATOR'", [req.params.id]); if (!user.rowCount)
            throw new errors_1.ApiError(404, 'NOT_FOUND', 'Field Coordinator not found.'); const school = await c.query('SELECT 1 FROM schools WHERE school_id=$1', [req.params.schoolId]); if (!school.rowCount)
            throw new errors_1.ApiError(404, 'NOT_FOUND', 'School not found.'); await c.query('INSERT INTO field_coordinator_schools(coordinator_user_id,school_id) VALUES($1,$2)', [req.params.id, req.params.schoolId]); await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('FieldCoordinatorAssignment',$1,'CREATE',$2,jsonb_build_object('school_id',$3))", [req.params.id, req.principal.userId, req.params.schoolId]); });
        res.status(201).json({ coordinator_user_id: req.params.id, school_id: req.params.schoolId });
    }
    catch (e) {
        next(e);
    }
});
