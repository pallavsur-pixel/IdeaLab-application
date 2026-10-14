"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyAssessment = verifyAssessment;
const gap_engine_1 = require("../../domain/gap-engine");
const priority_engine_1 = require("../../domain/priority-engine");
const errors_1 = require("../../shared/errors");
async function verifyAssessment(client, assessmentId, adminId, status, reason) {
    const q = await client.query(`SELECT a.*,s.student_strength_total,s.school_id FROM assessments a JOIN schools s USING(school_id) WHERE assessment_id=$1 FOR UPDATE`, [assessmentId]);
    if (!q.rowCount)
        throw new errors_1.ApiError(404, 'NOT_FOUND', 'Assessment not found.');
    const assessment = q.rows[0];
    if (assessment.status !== 'SUBMITTED')
        throw new errors_1.ApiError(409, 'INVALID_ASSESSMENT_STATE', 'Only submitted assessments can be verified.', { current_status: assessment.status });
    if (status === 'REJECTED' && (!reason || reason.trim().length === 0))
        throw new errors_1.ApiError(400, 'VALIDATION_ERROR', 'A reason is required when rejecting an assessment.');
    const before = { status: assessment.status };
    if (status === 'REJECTED') {
        await client.query("UPDATE assessments SET status='REJECTED',rejection_reason=$2,verified_by=$3,verified_at=now(),version=version+1 WHERE assessment_id=$1", [assessmentId, reason, adminId]);
        await client.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Assessment',$1,'REJECT',$2,$3::jsonb,jsonb_build_object('status','REJECTED','reason',$4))", [assessmentId, adminId, JSON.stringify(before), reason]);
        return;
    }
    const resources = await client.query(`SELECT sr.*,r.category_id,rc.importance_weight,s.student_strength_total
    FROM school_resources sr JOIN resources r USING(resource_id) JOIN resource_categories rc USING(category_id)
    JOIN assessments a USING(assessment_id) JOIN schools s USING(school_id) WHERE sr.assessment_id=$1 ORDER BY sr.school_resource_id`, [assessmentId]);
    if (!resources.rowCount)
        throw new errors_1.ApiError(400, 'EMPTY_ASSESSMENT', 'An assessment must contain at least one resource row.');
    const configResult = await client.query('SELECT * FROM weight_configs WHERE is_active=true');
    if (!configResult.rowCount)
        throw new errors_1.ApiError(500, 'SCORING_NOT_CONFIGURED', 'No active weight configuration exists.');
    const config = configResult.rows[0];
    const maxStudents = Math.max(...resources.rows.map(r => Number(r.students_affected ?? r.student_strength_total)));
    const newGaps = new Map();
    for (const r of resources.rows) {
        const gap = (0, gap_engine_1.calculateGap)(Number(r.required_qty), Number(r.functional_qty));
        const gapRow = await client.query(`INSERT INTO gap_records(school_resource_id,gap_qty,gap_ratio,computed_at) VALUES($1,$2,$3,now())
      ON CONFLICT(school_resource_id) DO UPDATE SET gap_qty=excluded.gap_qty,gap_ratio=excluded.gap_ratio,computed_at=now() RETURNING gap_id`, [r.school_resource_id, gap.gapQty, gap.gapRatio]);
        if (gap.gapQty === 0)
            continue;
        const score = (0, priority_engine_1.calculatePriority)({ gapRatio: gap.gapRatio, importance: Number(r.importance_weight), studentsAffected: Number(r.students_affected ?? r.student_strength_total), maxStudentsAffected: maxStudents, alternative: r.has_alternative, condition: r.condition_rating, config });
        const scoreRow = await client.query(`INSERT INTO priority_scores(school_resource_id,weight_config_id,severity_score,importance_score,students_score,alternative_score,condition_score,final_score,priority_class,computed_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING score_id`, [r.school_resource_id, config.config_id, score.severity, score.importance, score.students, score.alternative, score.condition, score.finalScore, score.priorityClass]);
        newGaps.set(r.resource_id, { gapId: gapRow.rows[0].gap_id, scoreId: scoreRow.rows[0].score_id, gapQty: gap.gapQty });
    }
    const existing = await client.query(`SELECT * FROM requirements WHERE school_id=$1 AND status<>'CLOSED' FOR UPDATE`, [assessment.school_id]);
    for (const old of existing.rows) {
        const next = newGaps.get(old.resource_id);
        if (!next) {
            if (old.status === 'OPEN' || old.status === 'UNDER_REVIEW') {
                await client.query("UPDATE requirements SET status='CLOSED',version=version+1 WHERE requirement_id=$1", [old.requirement_id]);
                await client.query("INSERT INTO requirement_status_events(requirement_id,old_status,new_status,actor_id) VALUES($1,$2,'CLOSED',$3)", [old.requirement_id, old.status, adminId]);
                await client.query("INSERT INTO interventions(requirement_id,org_id,action_description,status_at_entry,updated_by,comments) VALUES($1,$2,'Gap resolved in a newer verified assessment','CLOSED',NULL,'System generated')", [old.requirement_id, old.assigned_org_id]);
                await client.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Requirement',$1,'STATUS_CHANGE',$3,jsonb_build_object('status',$2),jsonb_build_object('status','CLOSED','reason','Gap resolved by new assessment'))", [old.requirement_id, old.status, adminId]);
            }
            else if (['ACCEPTED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(old.status)) {
                const changed = await client.query('UPDATE requirements SET data_changed_since_acceptance=true,version=version+1 WHERE requirement_id=$1 AND data_changed_since_acceptance=false', [old.requirement_id]);
                if (changed.rowCount)
                    await client.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Requirement',$1,'DATA_CHANGE_FLAG',$2,jsonb_build_object('data_changed_since_acceptance',false),jsonb_build_object('data_changed_since_acceptance',true))", [old.requirement_id, adminId]);
            }
            continue;
        }
        if (old.status === 'OPEN' || old.status === 'UNDER_REVIEW') {
            await client.query('UPDATE requirements SET gap_id=$2,score_id=$3,accepted_gap_qty=$4,version=version+1 WHERE requirement_id=$1', [old.requirement_id, next.gapId, next.scoreId, next.gapQty]);
        }
        else if (['ACCEPTED', 'IN_PROGRESS', 'PARTIALLY_COMPLETED'].includes(old.status)) {
            const changed = await client.query('UPDATE requirements SET data_changed_since_acceptance=true,version=version+1 WHERE requirement_id=$1 AND data_changed_since_acceptance=false', [old.requirement_id]);
            if (changed.rowCount)
                await client.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Requirement',$1,'DATA_CHANGE_FLAG',$2,jsonb_build_object('data_changed_since_acceptance',false),jsonb_build_object('data_changed_since_acceptance',true))", [old.requirement_id, adminId]);
        }
    }
    for (const [resourceId, next] of newGaps) {
        const present = existing.rows.some(r => r.resource_id === resourceId);
        if (!present) {
            const created = await client.query('INSERT INTO requirements(school_id,resource_id,gap_id,score_id,accepted_gap_qty) VALUES($1,$2,$3,$4,$5) RETURNING requirement_id', [assessment.school_id, resourceId, next.gapId, next.scoreId, next.gapQty]);
            await client.query("INSERT INTO requirement_status_events(requirement_id,old_status,new_status,actor_id) VALUES($1,NULL,'OPEN',$2)", [created.rows[0].requirement_id, adminId]);
            await client.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,new_value) VALUES('Requirement',$1,'CREATE',$2,jsonb_build_object('status','OPEN','school_id',$3,'resource_id',$4))", [created.rows[0].requirement_id, adminId, assessment.school_id, resourceId]);
        }
    }
    await client.query("UPDATE assessments SET status='VERIFIED',verified_by=$2,verified_at=now(),version=version+1 WHERE assessment_id=$1", [assessmentId, adminId]);
    await client.query("INSERT INTO audit_logs(entity_type,entity_id,action,performed_by,old_value,new_value) VALUES('Assessment',$1,'VERIFY',$2,$3::jsonb,jsonb_build_object('status','VERIFIED'))", [assessmentId, adminId, JSON.stringify(before)]);
}
