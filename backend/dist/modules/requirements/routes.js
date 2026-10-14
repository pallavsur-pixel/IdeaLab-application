"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requirementRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const pool_1 = require("../../db/pool");
const auth_1 = require("../../middleware/auth");
const errors_1 = require("../../shared/errors");
const pagination_1 = require("../../shared/pagination");
const rbac_1 = require("../../shared/rbac");
exports.requirementRouter = (0, express_1.Router)();
exports.requirementRouter.use(auth_1.authenticate);
const latestVerified = `a.assessment_id=(SELECT a2.assessment_id FROM assessments a2 WHERE a2.school_id=s.school_id AND a2.status='VERIFIED' ORDER BY a2.verified_at DESC LIMIT 1)`;
exports.requirementRouter.get('/requirements', (0, auth_1.allow)('NGO', 'ADMIN', 'SCHOOL', 'FIELD_COORDINATOR'), async (req, res, next) => {
    try {
        const { page, pageSize, offset } = (0, pagination_1.pagination)(req);
        const filters = [];
        const values = [];
        if (req.principal.role === 'NGO') {
            const org = await pool_1.pool.query('SELECT org_id,verification_status FROM organizations WHERE user_id=$1', [req.principal.userId]);
            if (!org.rowCount || org.rows[0].verification_status !== 'VERIFIED')
                filters.push('false');
            else {
                values.push(org.rows[0].org_id);
                filters.push(`(r.assigned_org_id=$${values.length} OR (r.assigned_org_id IS NULL AND r.status IN ('OPEN','UNDER_REVIEW')))`);
            }
        }
        if (req.query.priority_class) {
            values.push(req.query.priority_class);
            filters.push(`ps.priority_class=$${values.length}`);
        }
        if (req.query.status) {
            values.push(req.query.status);
            filters.push(`r.status=$${values.length}`);
        }
        if (req.query.district) {
            values.push(req.query.district);
            filters.push(`s.district=$${values.length}`);
        }
        if (req.query.resource_category) {
            values.push(req.query.resource_category);
            filters.push(`rc.category_id=$${values.length}`);
        }
        if (req.query.school_id) {
            values.push(req.query.school_id);
            filters.push(`r.school_id=$${values.length}`);
        }
        filters.push(latestVerified);
        if (req.principal.role === 'NGO')
            filters.push(`s.verification_status='VERIFIED'`);
        if (req.principal.role === 'SCHOOL') {
            values.push(req.principal.userId);
            filters.push(`s.user_id=$${values.length}`);
        }
        if (req.principal.role === 'FIELD_COORDINATOR') {
            values.push(req.principal.userId);
            filters.push(`EXISTS(SELECT 1 FROM field_coordinator_schools fcs WHERE fcs.school_id=s.school_id AND fcs.coordinator_user_id=$${values.length})`);
        }
        const where = filters.length ? `WHERE ${filters.join(' AND ')}` : '';
        const base = `FROM requirements r JOIN schools s USING(school_id) JOIN resources res USING(resource_id) JOIN resource_categories rc USING(category_id)
      JOIN gap_records g USING(gap_id) JOIN school_resources sr USING(school_resource_id) JOIN priority_scores ps ON ps.score_id=r.score_id JOIN assessments a ON a.assessment_id=(SELECT a2.assessment_id FROM assessments a2 WHERE a2.school_id=s.school_id AND a2.status='VERIFIED' ORDER BY a2.verified_at DESC LIMIT 1)`;
        const [rows, count] = await Promise.all([pool_1.pool.query(`SELECT r.*,s.school_name,s.district,res.name AS resource_name,rc.name AS category_name,g.gap_qty,g.gap_ratio,coalesce(sr.students_affected,s.student_strength_total) AS students_affected,ps.final_score,ps.priority_class ${base} ${where} ORDER BY ps.final_score DESC,g.gap_ratio DESC,coalesce(sr.students_affected,s.student_strength_total) DESC,r.created_at ASC,r.requirement_id ASC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, offset]), pool_1.pool.query(`SELECT count(*) ${base} ${where}`, values)]);
        res.json((0, pagination_1.paged)(rows.rows, page, pageSize, count.rows[0].count));
    }
    catch (e) {
        next(e);
    }
});
exports.requirementRouter.get('/requirements/:id', (0, auth_1.allow)('NGO', 'ADMIN', 'SCHOOL', 'FIELD_COORDINATOR'), async (req, res, next) => {
    try {
        const q = await pool_1.pool.query(`SELECT r.*,s.school_name,s.user_id AS school_user_id,s.verification_status AS school_verification,
      a.status AS assessment_status,a.verified_at,res.name AS resource_name,rc.name AS category_name,g.gap_qty,g.gap_ratio,
      ps.severity_score,ps.importance_score,ps.students_score,ps.alternative_score,ps.condition_score,ps.final_score,ps.priority_class,
      (SELECT json_agg(i ORDER BY i.created_at) FROM interventions i WHERE i.requirement_id=r.requirement_id) AS interventions,
      (SELECT json_agg(f ORDER BY f.created_at) FROM feedback f WHERE f.requirement_id=r.requirement_id) AS feedback
      FROM requirements r JOIN schools s USING(school_id) JOIN resources res USING(resource_id) JOIN resource_categories rc USING(category_id)
      JOIN gap_records g USING(gap_id) JOIN priority_scores ps ON ps.score_id=r.score_id
      JOIN assessments a ON a.assessment_id=(SELECT a2.assessment_id FROM assessments a2 WHERE a2.school_id=s.school_id AND a2.status='VERIFIED' ORDER BY a2.verified_at DESC LIMIT 1)
      WHERE r.requirement_id=$1`, [req.params.id]);
        if (!q.rowCount)
            throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
        const row = q.rows[0];
        if ((req.principal.role === 'SCHOOL' || req.principal.role === 'FIELD_COORDINATOR') && !(await (0, auth_1.canAccessSchool)(req.principal.userId, req.principal.role, row.school_id)))
            throw new errors_1.ApiError(403, 'FORBIDDEN', 'You cannot view this requirement.');
        if (req.principal.role === 'NGO') {
            const org = await pool_1.pool.query('SELECT org_id,verification_status FROM organizations WHERE user_id=$1', [req.principal.userId]);
            const orgId = org.rows[0]?.org_id ?? null;
            const owns = !!orgId && row.assigned_org_id === orgId;
            if (!(0, rbac_1.canNgoViewRequirement)(row, orgId, org.rows[0]?.verification_status === 'VERIFIED'))
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
            const interventions = owns ? (row.interventions ?? []).filter((i) => i.org_id === org.rows[0].org_id).map((i) => ({ status_at_entry: i.status_at_entry, created_at: i.created_at })) : [];
            const feedback = (row.feedback ?? []).filter((f) => f.source === 'SCHOOL');
            const { school_user_id: _schoolUserId, school_verification: _schoolVerification, assessment_status: _assessmentStatus, interventions: _allInterventions, feedback: _allFeedback, ...visible } = row;
            res.json({ ...visible, interventions, feedback });
            return;
        }
        if (req.principal.role === 'SCHOOL') {
            const interventions = (0, rbac_1.schoolVisibleInterventions)(row.interventions);
            const feedback = (0, rbac_1.schoolVisibleFeedback)(row.feedback);
            const { school_user_id: _schoolUserId, school_verification: _schoolVerification, assessment_status: _assessmentStatus, interventions: _allInterventions, feedback: _allFeedback, ...visible } = row;
            res.json({ ...(0, rbac_1.schoolVisibleRequirement)(visible), interventions, feedback });
            return;
        }
        const { school_user_id: _schoolUserId, school_verification: _schoolVerification, assessment_status: _assessmentStatus, ...visible } = row;
        res.json(visible);
    }
    catch (e) {
        next(e);
    }
});
exports.requirementRouter.post('/requirements/:id/accept', (0, auth_1.allow)('NGO'), async (req, res, next) => {
    try {
        const body = zod_1.z.object({ expected_version: zod_1.z.number().int().positive() }).parse(req.body);
        const result = await (0, pool_1.inTransaction)(async (c) => {
            const org = await c.query('SELECT org_id,verification_status FROM organizations WHERE user_id=$1', [req.principal.userId]);
            if (!org.rowCount)
                throw new errors_1.ApiError(403, 'FORBIDDEN', 'An organization profile is required.');
            if (org.rows[0].verification_status !== 'VERIFIED')
                throw new errors_1.ApiError(403, 'ORGANIZATION_UNVERIFIED', 'Your organization must be verified before accepting requirements.');
            const row = await c.query(`SELECT r.*,s.verification_status,(SELECT status FROM assessments a WHERE a.school_id=r.school_id AND a.status='VERIFIED' ORDER BY verified_at DESC LIMIT 1) AS assessment_status
        FROM requirements r JOIN schools s USING(school_id) WHERE requirement_id=$1 FOR UPDATE`, [req.params.id]);
            if (!row.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
            const r = row.rows[0];
            if (r.school_verification !== 'VERIFIED' || r.assessment_status !== 'VERIFIED')
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
            if (r.assigned_org_id && r.assigned_org_id !== org.rows[0].org_id)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
            if (Number(r.version) !== body.expected_version)
                throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Requirement changed since it was read.', { current: { status: r.status, version: r.version } });
            if (!['OPEN', 'UNDER_REVIEW'].includes(r.status))
                throw new errors_1.ApiError(409, 'INVALID_TRANSITION', 'Only OPEN or UNDER_REVIEW requirements can be accepted.', { current_status: r.status, attempted_status: 'ACCEPTED' });
            await c.query("UPDATE requirements SET status='ACCEPTED',assigned_org_id=$2,version=version+1,accepted_gap_qty=(SELECT gap_qty FROM gap_records WHERE gap_id=requirements.gap_id) WHERE requirement_id=$1", [req.params.id, org.rows[0].org_id]);
            await c.query("INSERT INTO interventions(requirement_id,org_id,action_description,status_at_entry,updated_by) VALUES($1,$2,'Accepted requirement','ACCEPTED',$3)", [req.params.id, org.rows[0].org_id, req.principal.userId]);
            await c.query("INSERT INTO requirement_status_events(requirement_id,old_status,new_status,actor_id) VALUES($1,$2,'ACCEPTED',$3)", [req.params.id, r.status, req.principal.userId]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Requirement',$1,'STATUS_CHANGE',$2,jsonb_build_object('status',$3),jsonb_build_object('status','ACCEPTED','assigned_org_id',$4))", [req.params.id, req.principal.userId, r.status, org.rows[0].org_id]);
            return (await c.query('SELECT * FROM requirements WHERE requirement_id=$1', [req.params.id])).rows[0];
        });
        res.json(result);
    }
    catch (e) {
        next(e);
    }
});
exports.requirementRouter.post('/requirements/:id/acknowledge-data-change', (0, auth_1.allow)('NGO'), async (req, res, next) => {
    try {
        const body = zod_1.z.object({ expected_version: zod_1.z.number().int().positive() }).parse(req.body);
        const updated = await (0, pool_1.inTransaction)(async (c) => {
            const q = await c.query('SELECT * FROM requirements WHERE requirement_id=$1 FOR UPDATE', [req.params.id]);
            if (!q.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
            const r = q.rows[0];
            const org = await c.query("SELECT org_id FROM organizations WHERE user_id=$1 AND verification_status='VERIFIED'", [req.principal.userId]);
            if (!org.rowCount || org.rows[0].org_id !== r.assigned_org_id)
                throw new errors_1.ApiError(403, 'FORBIDDEN', 'Only the verified assigned organization can acknowledge this change.');
            if (Number(r.version) !== body.expected_version)
                throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Requirement changed since it was read.', { current: { version: r.version } });
            if (!r.data_changed_since_acceptance)
                throw new errors_1.ApiError(409, 'NO_DATA_CHANGE', 'There is no unacknowledged assessment change.');
            const latest = await c.query(`SELECT g.gap_id,ps.score_id,g.gap_qty FROM assessments a JOIN school_resources sr USING(assessment_id) JOIN gap_records g USING(school_resource_id)
        JOIN priority_scores ps ON ps.school_resource_id=sr.school_resource_id WHERE a.school_id=$1 AND a.status='VERIFIED' AND sr.resource_id=$2 ORDER BY a.verified_at DESC,ps.computed_at DESC LIMIT 1`, [r.school_id, r.resource_id]);
            if (!latest.rowCount)
                throw new errors_1.ApiError(409, 'LATEST_DATA_UNAVAILABLE', 'The latest verified assessment has no matching resource record.');
            await c.query('UPDATE requirements SET gap_id=$2,score_id=$3,data_changed_since_acceptance=false,version=version+1 WHERE requirement_id=$1', [req.params.id, latest.rows[0].gap_id, latest.rows[0].score_id]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Requirement',$1,'ACKNOWLEDGE_DATA_CHANGE',$2,jsonb_build_object('gap_id',$3,'score_id',$4,'data_changed_since_acceptance',true),jsonb_build_object('gap_id',$5,'score_id',$6,'data_changed_since_acceptance',false))", [req.params.id, req.principal.userId, r.gap_id, r.score_id, latest.rows[0].gap_id, latest.rows[0].score_id]);
            return (await c.query('SELECT * FROM requirements WHERE requirement_id=$1', [req.params.id])).rows[0];
        });
        res.json(updated);
    }
    catch (e) {
        next(e);
    }
});
exports.requirementRouter.post('/requirements/:id/status', (0, auth_1.allow)('NGO', 'ADMIN'), async (req, res, next) => {
    try {
        const body = zod_1.z.object({ new_status: zod_1.z.enum(['OPEN', 'UNDER_REVIEW', 'ACCEPTED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED', 'COMPLETED', 'NOT_FEASIBLE', 'DISPUTED', 'CLOSED']), fulfilled_qty: zod_1.z.number().int().nonnegative().optional(), reason: zod_1.z.string().optional(), comments: zod_1.z.string().optional(), action_description: zod_1.z.string().optional(), expected_version: zod_1.z.number().int().positive() }).parse(req.body);
        const updated = await (0, pool_1.inTransaction)(async (c) => {
            const lock = await c.query(`SELECT r.*,g.gap_qty AS current_gap_qty FROM requirements r JOIN gap_records g USING(gap_id) WHERE requirement_id=$1 FOR UPDATE`, [req.params.id]);
            if (!lock.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
            const r = lock.rows[0];
            const isAdmin = req.principal.role === 'ADMIN';
            if (!isAdmin) {
                const org = await c.query("SELECT org_id FROM organizations WHERE user_id=$1 AND verification_status='VERIFIED'", [req.principal.userId]);
                if (!org.rowCount || org.rows[0].org_id !== r.assigned_org_id)
                    throw new errors_1.ApiError(403, 'FORBIDDEN', 'Only the verified assigned organization can update this requirement.');
            }
            if (Number(r.version) !== body.expected_version)
                throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Requirement changed since it was read.', { current: { status: r.status, version: r.version } });
            const transitions = { UNDER_REVIEW: ['OPEN'], ACCEPTED: ['IN_PROGRESS'], IN_PROGRESS: ['PARTIALLY_COMPLETED', 'COMPLETED', 'NOT_FEASIBLE'], PARTIALLY_COMPLETED: ['IN_PROGRESS', 'COMPLETED', 'NOT_FEASIBLE'], NOT_FEASIBLE: ['OPEN'], DISPUTED: ['IN_PROGRESS', 'CLOSED'] };
            if (!transitions[r.status]?.includes(body.new_status))
                throw new errors_1.ApiError(409, 'INVALID_TRANSITION', `Cannot move requirement from ${r.status} to ${body.new_status}.`, { current_status: r.status, attempted_status: body.new_status });
            if (!isAdmin) {
                if (body.new_status === 'OPEN' || body.new_status === 'CLOSED' || body.new_status === 'DISPUTED')
                    throw new errors_1.ApiError(403, 'FORBIDDEN', 'This transition requires an Admin or school confirmation.');
            }
            if (r.status === 'DISPUTED' && !isAdmin)
                throw new errors_1.ApiError(403, 'FORBIDDEN', 'Only an Admin can resolve a dispute.');
            if (body.new_status === 'OPEN' && (!isAdmin || !body.reason || body.reason.trim().length < 10))
                throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'Reopening requires an Admin and a reason of at least 10 characters.');
            if (body.new_status === 'CLOSED' && r.status === 'DISPUTED' && (!isAdmin || !body.comments?.trim()))
                throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'Force-closing a dispute requires an Admin comment.');
            if (body.new_status === 'NOT_FEASIBLE' && (!body.reason || body.reason.trim().length < 10))
                throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'A reason of at least 10 characters is required.');
            let fulfilled = Number(r.fulfilled_qty);
            if (body.new_status === 'PARTIALLY_COMPLETED') {
                if (body.fulfilled_qty === undefined || body.fulfilled_qty < 1 || body.fulfilled_qty > Number(r.accepted_gap_qty))
                    throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'fulfilled_qty must be from 1 through the gap quantity captured at acceptance.');
                fulfilled = body.fulfilled_qty;
            }
            let target = body.new_status;
            if (target === 'PARTIALLY_COMPLETED' && fulfilled >= Number(r.accepted_gap_qty))
                target = 'COMPLETED';
            if (body.new_status === 'IN_PROGRESS' && body.fulfilled_qty !== undefined) {
                if (body.fulfilled_qty < Number(r.fulfilled_qty) || body.fulfilled_qty > Number(r.accepted_gap_qty))
                    throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'fulfilled_qty must be cumulative and within the accepted gap.');
                fulfilled = body.fulfilled_qty;
                if (fulfilled >= Number(r.accepted_gap_qty))
                    target = 'COMPLETED';
            }
            const notFeasible = target === 'NOT_FEASIBLE' ? body.reason : r.not_feasible_reason;
            if (target === 'COMPLETED')
                fulfilled = Number(r.accepted_gap_qty);
            const resetAssignment = target === 'OPEN' && r.status === 'NOT_FEASIBLE';
            await c.query('UPDATE requirements SET status=$2,fulfilled_qty=$3,not_feasible_reason=$4,assigned_org_id=CASE WHEN $5 THEN NULL ELSE assigned_org_id END,completed_at=CASE WHEN $2=\'COMPLETED\' THEN now() ELSE NULL END,version=version+1 WHERE requirement_id=$1', [req.params.id, target, fulfilled, notFeasible ?? null, resetAssignment]);
            if (req.principal.role === 'NGO' && ['ACCEPTED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(r.status) && r.assigned_org_id)
                await c.query('INSERT INTO interventions(requirement_id,org_id,action_description,status_at_entry,updated_by,comments) VALUES($1,$2,$3,$4,$5,$6)', [req.params.id, r.assigned_org_id, body.action_description ?? `Status changed to ${target}`, target, req.principal.userId, body.comments ?? null]);
            await c.query('INSERT INTO requirement_status_events(requirement_id,old_status,new_status,actor_id) VALUES($1,$2,$3,$4)', [req.params.id, r.status, target, req.principal.userId]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Requirement',$1,'STATUS_CHANGE',$2,jsonb_build_object('status',$3),jsonb_build_object('status',$4,'fulfilled_qty',$5,'reason',$6,'comments',$7))", [req.params.id, req.principal.userId, r.status, target, fulfilled, body.reason ?? null, body.comments ?? null]);
            return (await c.query('SELECT * FROM requirements WHERE requirement_id=$1', [req.params.id])).rows[0];
        });
        res.json(updated);
    }
    catch (e) {
        next(e);
    }
});
exports.requirementRouter.post('/requirements/:id/feedback', (0, auth_1.allow)('SCHOOL', 'NGO', 'ADMIN'), async (req, res, next) => {
    try {
        const body = zod_1.z.object({ source: zod_1.z.enum(['SCHOOL', 'NGO', 'ADMIN']).optional(), confirmation: zod_1.z.enum(['CONFIRMED', 'DISPUTED']).optional(), comments: zod_1.z.string().optional(), evidence_url: zod_1.z.string().url().optional(), expected_version: zod_1.z.number().int().positive().optional() }).parse(req.body);
        const result = await (0, pool_1.inTransaction)(async (c) => {
            const q = await c.query(`SELECT r.*,s.user_id AS school_user_id,o.user_id AS org_user_id,o.verification_status AS org_verification_status FROM requirements r JOIN schools s USING(school_id) LEFT JOIN organizations o ON o.org_id=r.assigned_org_id WHERE requirement_id=$1 FOR UPDATE OF r`, [req.params.id]);
            if (!q.rowCount)
                throw new errors_1.ApiError(404, 'NOT_FOUND', 'Requirement not found.');
            const r = q.rows[0];
            const source = body.source ?? req.principal.role;
            if (source === 'SCHOOL') {
                if (req.principal.role !== 'SCHOOL' || r.school_user_id !== req.principal.userId)
                    throw new errors_1.ApiError(403, 'FORBIDDEN', 'Only the school can submit school confirmation.');
                if (body.expected_version === undefined || Number(r.version) !== body.expected_version)
                    throw new errors_1.ApiError(409, 'VERSION_CONFLICT', 'Requirement changed since it was read.', { current: { status: r.status, version: r.version } });
                if (r.status !== 'COMPLETED')
                    throw new errors_1.ApiError(409, 'INVALID_TRANSITION', 'School confirmation is accepted only for completed requirements.', { current_status: r.status });
                if (!body.confirmation)
                    throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'School feedback requires confirmation.');
            }
            else if (source === 'NGO') {
                if (req.principal.role !== 'NGO' || r.org_user_id !== req.principal.userId || r.org_verification_status !== 'VERIFIED')
                    throw new errors_1.ApiError(403, 'FORBIDDEN', 'Only the verified assigned organization can submit NGO feedback.');
            }
            else if (req.principal.role !== 'ADMIN')
                throw new errors_1.ApiError(403, 'FORBIDDEN', 'Only an Admin can submit Admin feedback.');
            const f = await c.query('INSERT INTO feedback(requirement_id,source,confirmation,comments,evidence_url) VALUES($1,$2,$3,$4,$5) RETURNING *', [req.params.id, source, source === 'SCHOOL' ? body.confirmation : null, body.comments ?? null, body.evidence_url ?? null]);
            await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('Feedback',$1,'CREATE',$2,jsonb_build_object('requirement_id',$3,'source',$4,'confirmation',$5,'comments',$6))", [f.rows[0].feedback_id, req.principal.userId, req.params.id, source, body.confirmation ?? null, body.comments ?? null]);
            if (source === 'SCHOOL') {
                const target = body.confirmation === 'CONFIRMED' ? 'CLOSED' : 'DISPUTED';
                await c.query('UPDATE requirements SET status=$2,version=version+1 WHERE requirement_id=$1', [req.params.id, target]);
                await c.query('INSERT INTO requirement_status_events(requirement_id,old_status,new_status,actor_id) VALUES($1,$2,$3,$4)', [req.params.id, r.status, target, req.principal.userId]);
                await c.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Requirement',$1,'STATUS_CHANGE',$2,jsonb_build_object('status',$3),jsonb_build_object('status',$4,'feedback_id',$5))", [req.params.id, req.principal.userId, r.status, target, f.rows[0].feedback_id]);
            }
            return f.rows[0];
        });
        res.status(201).json(result);
    }
    catch (e) {
        next(e);
    }
});
