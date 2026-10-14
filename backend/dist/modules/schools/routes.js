"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.schoolRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const pool_1 = require("../../db/pool");
const auth_1 = require("../../middleware/auth");
const errors_1 = require("../../shared/errors");
const pagination_1 = require("../../shared/pagination");
const recompute_1 = require("../scoring/recompute");
exports.schoolRouter = (0, express_1.Router)();
exports.schoolRouter.use(auth_1.authenticate);
const schoolInput = zod_1.z.object({ school_name: zod_1.z.string().min(1).max(255), udise_code: zod_1.z.string().regex(/^\d{11}$/).optional(), school_type: zod_1.z.enum(['GOVERNMENT', 'AIDED', 'PRIVATE']), district: zod_1.z.string().min(1).max(100), state: zod_1.z.string().min(1).max(100), address: zod_1.z.string().optional(), latitude: zod_1.z.number().min(-90).max(90).optional(), longitude: zod_1.z.number().min(-180).max(180).optional(), student_strength_total: zod_1.z.number().int().nonnegative(), contact_person: zod_1.z.string().max(150).optional(), contact_phone: zod_1.z.string().regex(/^\+[1-9]\d{1,14}$/).optional() }).refine(v => (v.latitude === undefined) === (v.longitude === undefined), { message: 'Latitude and longitude must be provided together.' });
exports.schoolRouter.post('/schools', (0, auth_1.allow)('SCHOOL'), async (req, res, next) => {
    try {
        const p = schoolInput.parse(req.body);
        const row = await (0, pool_1.inTransaction)(async (c) => {
            const r = await c.query(`INSERT INTO schools(user_id,school_name,udise_code,school_type,district,state,address,latitude,longitude,student_strength_total,contact_person,contact_phone)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *`, [req.principal.userId, p.school_name, p.udise_code ?? null, p.school_type, p.district, p.state, p.address ?? null, p.latitude ?? null, p.longitude ?? null, p.student_strength_total, p.contact_person ?? null, p.contact_phone ?? null]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('School',$1,'CREATE',$2,to_jsonb($3::json))", [r.rows[0].school_id, req.principal.userId, JSON.stringify({ verification_status: 'PENDING' })]);
            return r.rows[0];
        });
        res.status(201).json(row);
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.get('/schools', (0, auth_1.allow)('ADMIN', 'NGO', 'FIELD_COORDINATOR', 'SCHOOL'), async (req, res, next) => {
    try {
        const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
        const filters = [];
        const values = [];
        if (req.principal.role === 'SCHOOL') {
            values.push(req.principal.userId);
            filters.push(`s.user_id=$${values.length}`);
        }
        else if (req.principal.role === 'FIELD_COORDINATOR') {
            values.push(req.principal.userId);
            filters.push(`EXISTS(SELECT 1 FROM field_coordinator_schools fcs WHERE fcs.school_id=s.school_id AND fcs.coordinator_user_id=$${values.length})`);
        }
        else if (req.principal.role === 'NGO') {
            filters.push(`s.verification_status='VERIFIED'`);
        }
        if (req.query.search && typeof req.query.search === 'string' && req.query.search.trim()) {
            values.push(`%${req.query.search.trim().toLowerCase()}%`);
            filters.push(`(lower(s.school_name) LIKE $${values.length} OR s.udise_code LIKE $${values.length})`);
        }
        if (req.query.district && typeof req.query.district === 'string' && req.query.district.trim()) {
            values.push(req.query.district.trim());
            filters.push(`s.district=$${values.length}`);
        }
        if (req.query.verification_status && typeof req.query.verification_status === 'string' && req.query.verification_status.trim()) {
            values.push(req.query.verification_status.trim());
            filters.push(`s.verification_status=$${values.length}`);
        }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const [rows, count] = await Promise.all([
            pool_1.pool.query(`SELECT s.* FROM schools s ${where} ORDER BY s.school_name ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, offset]),
            pool_1.pool.query(`SELECT count(*)::int AS n FROM schools s ${where}`, values),
        ]);
        res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].n));
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.get('/schools/:id', async (req, res, next) => {
    try {
        const ok = await (0, auth_1.canAccessSchool)(req.principal.userId, req.principal.role, req.params.id);
        if (!ok)
            throw new errors_1.ApiError(403, 'FORBIDDEN', 'You cannot view this school.');
        const r = await pool_1.pool.query('SELECT * FROM schools WHERE school_id=$1', [req.params.id]);
        if (!r.rowCount)
            throw new errors_1.ApiError(404, 'NOT_FOUND', 'School not found.');
        res.json(r.rows[0]);
    }
    catch (e) {
        next(e);
    }
});
const schoolUpdateInput = zod_1.z.object({
    school_name: zod_1.z.string().min(1).max(255).optional(),
    udise_code: zod_1.z.string().regex(/^\d{11}$/).optional().nullable(),
    school_type: zod_1.z.enum(['GOVERNMENT', 'AIDED', 'PRIVATE']).optional(),
    district: zod_1.z.string().min(1).max(100).optional(),
    state: zod_1.z.string().min(1).max(100).optional(),
    address: zod_1.z.string().optional().nullable(),
    latitude: zod_1.z.number().min(-90).max(90).optional().nullable(),
    longitude: zod_1.z.number().min(-180).max(180).optional().nullable(),
    student_strength_total: zod_1.z.number().int().nonnegative().optional(),
    contact_person: zod_1.z.string().max(150).optional().nullable(),
    contact_phone: zod_1.z.string().optional().nullable(),
});
exports.schoolRouter.patch('/schools/:id', (0, auth_1.allow)('ADMIN', 'SCHOOL'), async (req, res, next) => {
    try {
        const p = schoolUpdateInput.parse(req.body);
        const updated = await (0, pool_1.inTransaction)(async (c) => {
            const existing = await c.query('SELECT * FROM schools WHERE school_id=$1 FOR UPDATE', [req.params.id]);
            if (!existing.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'School not found.');
            const s = existing.rows[0];
            if (req.principal.role === 'SCHOOL' && s.user_id !== req.principal.userId) {
                throw new errors_1.ApiError(403, 'FORBIDDEN', 'You can only edit your own school profile.');
            }
            const nextData = {
                school_name: p.school_name ?? s.school_name,
                udise_code: p.udise_code !== undefined ? p.udise_code : s.udise_code,
                school_type: p.school_type ?? s.school_type,
                district: p.district ?? s.district,
                state: p.state ?? s.state,
                address: p.address !== undefined ? p.address : s.address,
                latitude: p.latitude !== undefined ? p.latitude : s.latitude,
                longitude: p.longitude !== undefined ? p.longitude : s.longitude,
                student_strength_total: p.student_strength_total ?? s.student_strength_total,
                contact_person: p.contact_person !== undefined ? p.contact_person : s.contact_person,
                contact_phone: p.contact_phone !== undefined ? p.contact_phone : s.contact_phone,
            };
            await c.query(`UPDATE schools SET school_name=$2, udise_code=$3, school_type=$4, district=$5, state=$6, address=$7, latitude=$8, longitude=$9, student_strength_total=$10, contact_person=$11, contact_phone=$12 WHERE school_id=$1`, [
                req.params.id, nextData.school_name, nextData.udise_code, nextData.school_type, nextData.district, nextData.state, nextData.address, nextData.latitude, nextData.longitude, nextData.student_strength_total, nextData.contact_person, nextData.contact_phone
            ]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('School',$1,'UPDATE',$2,$3::jsonb,$4::jsonb)", [
                req.params.id, req.principal.userId, JSON.stringify(s), JSON.stringify(nextData)
            ]);
            return (await c.query('SELECT * FROM schools WHERE school_id=$1', [req.params.id])).rows[0];
        });
        res.json(updated);
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.patch('/schools/:id/verify', (0, auth_1.allow)('ADMIN'), async (req, res, next) => {
    try {
        const p = zod_1.z.object({ status: zod_1.z.enum(['VERIFIED', 'REJECTED']), reason: zod_1.z.string().min(1).optional() }).parse(req.body);
        if (p.status === 'REJECTED' && !p.reason)
            throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'reason is required when rejecting a school.');
        const r = await (0, pool_1.inTransaction)(async (c) => {
            const row = await c.query('SELECT verification_status FROM schools WHERE school_id=$1 FOR UPDATE', [req.params.id]);
            if (!row.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'School not found.');
            await c.query('UPDATE schools SET verification_status=$2 WHERE school_id=$1', [req.params.id, p.status]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('School',$1,'VERIFY',$2,jsonb_build_object('verification_status',$3),jsonb_build_object('verification_status',$4,'reason',$5))", [req.params.id, req.principal.userId, row.rows[0].verification_status, p.status, p.reason ?? null]);
            return (await c.query('SELECT * FROM schools WHERE school_id=$1', [req.params.id])).rows[0];
        });
        res.json(r);
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.post('/schools/:id/assessments', (0, auth_1.allow)('SCHOOL', 'FIELD_COORDINATOR'), async (req, res, next) => {
    try {
        const p = zod_1.z.object({ idempotency_key: zod_1.z.string().uuid(), assessment_date: zod_1.z.string().date(), resources: zod_1.z.array(zod_1.z.object({ resource_id: zod_1.z.string().uuid(), required_qty: zod_1.z.number().int().nonnegative(), available_qty: zod_1.z.number().int().nonnegative(), functional_qty: zod_1.z.number().int().nonnegative(), condition_rating: zod_1.z.enum(['GOOD', 'FAIR', 'POOR', 'NOT_APPLICABLE']), has_alternative: zod_1.z.enum(['NONE', 'PARTIAL', 'FULL']).default('NONE'), students_affected: zod_1.z.number().int().nonnegative().optional(), notes: zod_1.z.string().optional() }).refine(x => x.functional_qty <= x.available_qty, { message: 'functional_qty must not exceed available_qty' }).refine(x => (x.available_qty === 0) === (x.condition_rating === 'NOT_APPLICABLE'), { message: 'Condition rating must be NOT_APPLICABLE exactly when no units are available.' })) }).parse(req.body);
        if (!await (0, auth_1.canAccessSchool)(req.principal.userId, req.principal.role, req.params.id))
            throw new errors_1.ApiError(403, 'FORBIDDEN', 'You are not assigned to this school.');
        const r = await (0, pool_1.inTransaction)(async (c) => {
            const school = await c.query('SELECT * FROM schools WHERE school_id=$1 FOR UPDATE', [req.params.id]);
            if (!school.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'School not found.');
            const duplicate = await c.query('SELECT * FROM assessments WHERE school_id=$1 AND idempotency_key=$2', [req.params.id, p.idempotency_key]);
            if (duplicate.rowCount)
                return { row: duplicate.rows[0], duplicate: true };
            const latest = await c.query('SELECT assessment_id,assessment_date FROM assessments WHERE school_id=$1 ORDER BY created_at DESC LIMIT 1', [req.params.id]);
            if (latest.rowCount && p.assessment_date < String(latest.rows[0].assessment_date).slice(0, 10))
                throw new errors_1.ApiError(409, 'CONFLICT', 'A newer assessment already exists. Discard or manually re-apply the offline draft.');
            const count = await c.query('SELECT coalesce(max(version_number),0)+1 AS n FROM assessments WHERE school_id=$1', [req.params.id]);
            const resourceIds = [...new Set(p.resources.map(x => x.resource_id))];
            if (resourceIds.length) {
                const active = await c.query(`SELECT count(*)::int AS n FROM resources r JOIN resource_categories c USING(category_id) WHERE r.resource_id=ANY($1::uuid[]) AND r.is_active=true AND c.is_active=true`, [resourceIds]);
                if (active.rows[0].n !== resourceIds.length)
                    throw new errors_1.ApiError(400, 'INVALID_RESOURCE', 'Every assessment resource must be active.');
            }
            const created = await c.query("INSERT INTO assessments(school_id,submitted_by,assessment_date,idempotency_key,version_number,supersedes_assessment_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [req.params.id, req.principal.userId, p.assessment_date, p.idempotency_key, count.rows[0].n, latest.rows[0]?.assessment_id ?? null]);
            for (const item of p.resources)
                await c.query('INSERT INTO school_resources(assessment_id,resource_id,required_qty,available_qty,functional_qty,condition_rating,has_alternative,students_affected,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [created.rows[0].assessment_id, item.resource_id, item.required_qty, item.available_qty, item.functional_qty, item.condition_rating, item.has_alternative, item.students_affected ?? null, item.notes ?? null]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('Assessment',$1,'CREATE',$2,jsonb_build_object('status','DRAFT'))", [created.rows[0].assessment_id, req.principal.userId]);
            return { row: created.rows[0], duplicate: false };
        });
        res.status(r.duplicate ? 200 : 201).json(r.row);
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.patch('/assessments/:id', (0, auth_1.allow)('SCHOOL', 'FIELD_COORDINATOR'), async (req, res, next) => {
    try {
        const p = zod_1.z.object({ expected_version: zod_1.z.number().int().positive(), resources: zod_1.z.array(zod_1.z.object({ resource_id: zod_1.z.string().uuid(), required_qty: zod_1.z.number().int().nonnegative(), available_qty: zod_1.z.number().int().nonnegative(), functional_qty: zod_1.z.number().int().nonnegative(), condition_rating: zod_1.z.enum(['GOOD', 'FAIR', 'POOR', 'NOT_APPLICABLE']), has_alternative: zod_1.z.enum(['NONE', 'PARTIAL', 'FULL']).default('NONE'), students_affected: zod_1.z.number().int().nonnegative().optional(), notes: zod_1.z.string().optional() }).refine(x => x.functional_qty <= x.available_qty).refine(x => (x.available_qty === 0) === (x.condition_rating === 'NOT_APPLICABLE'))) }).parse(req.body);
        const row = await (0, pool_1.inTransaction)(async (c) => {
            const q = await c.query('SELECT a.*,s.school_id FROM assessments a JOIN schools s USING(school_id) WHERE assessment_id=$1 FOR UPDATE', [req.params.id]);
            if (!q.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Assessment not found.');
            const a = q.rows[0];
            if (a.submitted_by !== req.principal.userId || !await (0, auth_1.canAccessSchool)(req.principal.userId, req.principal.role, a.school_id))
                throw new errors_1.ApiError(403, 'FORBIDDEN', 'You cannot edit this assessment.');
            if (a.status !== 'DRAFT')
                throw new errors_1.ApiError(409, 'ASSESSMENT_LOCKED', 'Only draft assessments can be edited.', { current_status: a.status });
            if (Number(a.version) !== p.expected_version)
                throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Assessment changed since it was read.', { current: a });
            await c.query('DELETE FROM school_resources WHERE assessment_id=$1', [req.params.id]);
            for (const item of p.resources)
                await c.query('INSERT INTO school_resources(assessment_id,resource_id,required_qty,available_qty,functional_qty,condition_rating,has_alternative,students_affected,notes) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)', [req.params.id, item.resource_id, item.required_qty, item.available_qty, item.functional_qty, item.condition_rating, item.has_alternative, item.students_affected ?? null, item.notes ?? null]);
            await c.query('UPDATE assessments SET version=version+1 WHERE assessment_id=$1', [req.params.id]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Assessment',$1,'UPDATE',$2,jsonb_build_object('version',$3),jsonb_build_object('version',$4))", [req.params.id, req.principal.userId, a.version, Number(a.version) + 1]);
            return (await c.query('SELECT * FROM assessments WHERE assessment_id=$1', [req.params.id])).rows[0];
        });
        res.json(row);
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.post('/assessments/:id/submit', (0, auth_1.allow)('SCHOOL', 'FIELD_COORDINATOR'), async (req, res, next) => {
    try {
        const body = zod_1.z.object({ expected_version: zod_1.z.number().int().positive() }).parse(req.body);
        const r = await (0, pool_1.inTransaction)(async (c) => {
            const q = await c.query(`SELECT a.*,s.user_id,s.student_strength_total FROM assessments a JOIN schools s USING(school_id) WHERE assessment_id=$1 FOR UPDATE`, [req.params.id]);
            if (!q.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Assessment not found.');
            const a = q.rows[0];
            if (a.submitted_by !== req.principal.userId || !await (0, auth_1.canAccessSchool)(req.principal.userId, req.principal.role, a.school_id))
                throw new errors_1.ApiError(403, 'FORBIDDEN', 'Only the assessment owner can submit it.');
            if (a.status !== 'DRAFT')
                throw new errors_1.ApiError(409, 'INVALID_ASSESSMENT_STATE', 'Only draft assessments can be submitted.', { current_status: a.status });
            if (Number(a.version) !== body.expected_version)
                throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Assessment changed since it was read.', { current: a });
            const count = await c.query('SELECT count(*)::int AS n FROM school_resources WHERE assessment_id=$1', [req.params.id]);
            if (Number(a.student_strength_total) === 0 || count.rows[0].n === 0)
                throw new errors_1.ApiError(400, 'ASSESSMENT_INCOMPLETE', 'Submission requires a positive student count and at least one resource.');
            await c.query("UPDATE assessments SET status='SUBMITTED',version=version+1 WHERE assessment_id=$1", [req.params.id]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Assessment',$1,'SUBMIT',$2,jsonb_build_object('status','DRAFT'),jsonb_build_object('status','SUBMITTED'))", [req.params.id, req.principal.userId]);
            return (await c.query('SELECT * FROM assessments WHERE assessment_id=$1', [req.params.id])).rows[0];
        });
        res.json(r);
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.patch('/assessments/:id/verify', (0, auth_1.allow)('ADMIN'), async (req, res, next) => {
    try {
        const p = zod_1.z.object({ status: zod_1.z.enum(['VERIFIED', 'REJECTED']), reason: zod_1.z.string().optional(), expected_version: zod_1.z.number().int().positive() }).parse(req.body);
        const r = await (0, pool_1.inTransaction)(async (c) => { const current = await c.query('SELECT version FROM assessments WHERE assessment_id=$1 FOR UPDATE', [req.params.id]); if (!current.rowCount)
            throw new errors_1.ApiError(404, 'NOT_FOUND', 'Assessment not found.'); if (Number(current.rows[0].version) !== p.expected_version)
            throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Assessment changed since it was read.', { current: current.rows[0] }); await (0, recompute_1.verifyAssessment)(c, req.params.id, req.principal.userId, p.status, p.reason); return (await c.query('SELECT * FROM assessments WHERE assessment_id=$1', [req.params.id])).rows[0]; });
        res.json(r);
    }
    catch (e) {
        next(e);
    }
});
exports.schoolRouter.get('/schools/:id/assessments', async (req, res, next) => {
    try {
        if (!await (0, auth_1.canAccessSchool)(req.principal.userId, req.principal.role, req.params.id))
            throw new errors_1.ApiError(403, 'FORBIDDEN', 'You cannot view this school history.');
        const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
        const [list, count] = await Promise.all([pool_1.pool.query('SELECT * FROM assessments WHERE school_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3', [req.params.id, pageSize, offset]), pool_1.pool.query('SELECT count(*) FROM assessments WHERE school_id=$1', [req.params.id])]);
        res.json((0, pagination_1.paged)(list.rows, page, pageSize, count.rows[0].count));
    }
    catch (e) {
        next(e);
    }
});
