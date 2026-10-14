"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const pool_1 = require("./pool");
const gap_engine_1 = require("../domain/gap-engine");
const priority_engine_1 = require("../domain/priority-engine");
async function seedTestData() {
    process.stdout.write('Starting demo seed process...\n');
    await (0, pool_1.inTransaction)(async (c) => {
        // 1. Ensure master categories exist
        const categories = [
            { name: 'Science Laboratory', importance: 100 },
            { name: 'Physics Equipment', importance: 95 },
            { name: 'Chemistry Equipment', importance: 95 },
            { name: 'Biology Equipment', importance: 90 },
            { name: 'Computers/Computer Lab', importance: 85 },
            { name: 'Connectivity & EdTech', importance: 70 },
        ];
        const categoryMap = new Map();
        for (const cat of categories) {
            const res = await c.query(`INSERT INTO resource_categories(name, importance_weight)
         VALUES($1, $2)
         ON CONFLICT(name) DO UPDATE SET importance_weight=EXCLUDED.importance_weight
         RETURNING category_id, name`, [cat.name, cat.importance]);
            categoryMap.set(cat.name, res.rows[0].category_id);
        }
        // 2. Ensure resources exist
        const resources = [
            { cat: 'Science Laboratory', name: 'Compound Optical Microscope', unit: 'Units' },
            { cat: 'Science Laboratory', name: 'Borosilicate Test Tube Set (Pack of 50)', unit: 'Packs' },
            { cat: 'Science Laboratory', name: 'Precision Digital Balance (0.01g)', unit: 'Units' },
            { cat: 'Physics Equipment', name: 'Optics Bench & Glass Prism Kit', unit: 'Kits' },
            { cat: 'Physics Equipment', name: 'Vernier Calipers & Micrometer Gauge Set', unit: 'Sets' },
            { cat: 'Chemistry Equipment', name: 'Acid-Base Titration Apparatus', unit: 'Sets' },
            { cat: 'Chemistry Equipment', name: 'Periodic Table Interactive Chart', unit: 'Units' },
            { cat: 'Biology Equipment', name: 'Human Anatomy 3D Demonstration Model', unit: 'Units' },
            { cat: 'Biology Equipment', name: 'Prepared Slide Box (Botany & Zoology)', unit: 'Boxes' },
            { cat: 'Computers/Computer Lab', name: 'Desktop PC / Thin Client Workstation', unit: 'Units' },
        ];
        const resourceMap = new Map();
        for (const res of resources) {
            const catId = categoryMap.get(res.cat);
            const r = await c.query(`INSERT INTO resources(category_id, name, unit_of_measure)
         VALUES($1, $2, $3)
         ON CONFLICT(category_id, name) DO UPDATE SET unit_of_measure=EXCLUDED.unit_of_measure
         RETURNING resource_id, name`, [catId, res.name, res.unit]);
            resourceMap.set(res.name, r.rows[0].resource_id);
        }
        // 3. Create or update test users
        const defaultPassword = 'Password123';
        const pwHash = await bcryptjs_1.default.hash(defaultPassword, 10);
        // ADMIN
        const adminEmail = 'admin@scienceonwheels.in';
        let adminUser = await c.query('SELECT user_id FROM users WHERE lower(email)=$1', [adminEmail]);
        if (!adminUser.rowCount) {
            adminUser = await c.query(`INSERT INTO users(email, password_hash, role, full_name, phone)
         VALUES($1, $2, 'ADMIN', 'State System Administrator', '+919876543210')
         RETURNING user_id`, [adminEmail, pwHash]);
        }
        const adminId = adminUser.rows[0].user_id;
        // Active Weight Configuration
        let configQ = await c.query('SELECT * FROM weight_configs WHERE is_active=true');
        let configId;
        if (!configQ.rowCount) {
            const cfgRes = await c.query(`INSERT INTO weight_configs(severity_weight, importance_weight, students_weight, alternative_weight, condition_weight, critical_threshold, high_threshold, medium_threshold, is_active, created_by)
         VALUES(0.350, 0.250, 0.200, 0.100, 0.100, 80, 60, 40, true, $1)
         RETURNING config_id`, [adminId]);
            configId = cfgRes.rows[0].config_id;
            configQ = await c.query('SELECT * FROM weight_configs WHERE config_id=$1', [configId]);
        }
        else {
            configId = configQ.rows[0].config_id;
        }
        const weightCfg = configQ.rows[0];
        // SCHOOL USER & SCHOOL RECORD
        const schoolEmail = 'school@scienceonwheels.in';
        let schoolUser = await c.query('SELECT user_id FROM users WHERE lower(email)=$1', [schoolEmail]);
        if (!schoolUser.rowCount) {
            schoolUser = await c.query(`INSERT INTO users(email, password_hash, role, full_name, phone)
         VALUES($1, $2, 'SCHOOL', 'Principal Ramesh Kumar', '+919812345678')
         RETURNING user_id`, [schoolEmail, pwHash]);
        }
        const schoolUserId = schoolUser.rows[0].user_id;
        let schoolRecord = await c.query('SELECT school_id FROM schools WHERE user_id=$1', [schoolUserId]);
        let schoolId;
        if (!schoolRecord.rowCount) {
            const s = await c.query(`INSERT INTO schools(user_id, school_name, udise_code, school_type, district, state, address, student_strength_total, contact_person, contact_phone, verification_status)
         VALUES($1, 'Government Higher Secondary School Kolar', '29230101201', 'GOVERNMENT', 'Kolar', 'Karnataka', 'Main Road, Kolar Town, Karnataka 563101', 450, 'Ramesh Kumar', '+919812345678', 'VERIFIED')
         RETURNING school_id`, [schoolUserId]);
            schoolId = s.rows[0].school_id;
        }
        else {
            schoolId = schoolRecord.rows[0].school_id;
            await c.query("UPDATE schools SET verification_status='VERIFIED' WHERE school_id=$1", [schoolId]);
        }
        // NGO USER & ORGANIZATION RECORD
        const ngoEmail = 'ngo@scienceonwheels.in';
        let ngoUser = await c.query('SELECT user_id FROM users WHERE lower(email)=$1', [ngoEmail]);
        if (!ngoUser.rowCount) {
            ngoUser = await c.query(`INSERT INTO users(email, password_hash, role, full_name, phone)
         VALUES($1, $2, 'NGO', 'Dr. Anita Rao', '+919845612345')
         RETURNING user_id`, [ngoEmail, pwHash]);
        }
        const ngoUserId = ngoUser.rows[0].user_id;
        let ngoRecord = await c.query('SELECT org_id FROM organizations WHERE user_id=$1', [ngoUserId]);
        let orgId;
        if (!ngoRecord.rowCount) {
            const o = await c.query(`INSERT INTO organizations(user_id, org_name, registration_number, focus_areas, service_districts, verification_status)
         VALUES($1, 'Science For All Foundation', 'NGO-KA-2024-8841', ARRAY['Science Laboratory', 'Physics Equipment', 'Computers/Computer Lab'], ARRAY['Kolar', 'Tumakuru', 'Bengaluru Rural'], 'VERIFIED')
         RETURNING org_id`, [ngoUserId]);
            orgId = o.rows[0].org_id;
        }
        else {
            orgId = ngoRecord.rows[0].org_id;
            await c.query("UPDATE organizations SET verification_status='VERIFIED' WHERE org_id=$1", [orgId]);
        }
        // FIELD COORDINATOR
        const fcEmail = 'fc@scienceonwheels.in';
        let fcUser = await c.query('SELECT user_id FROM users WHERE lower(email)=$1', [fcEmail]);
        if (!fcUser.rowCount) {
            fcUser = await c.query(`INSERT INTO users(email, password_hash, role, full_name, phone)
         VALUES($1, $2, 'FIELD_COORDINATOR', 'Suresh Gowda', '+919876501234')
         RETURNING user_id`, [fcEmail, pwHash]);
        }
        const fcUserId = fcUser.rows[0].user_id;
        await c.query(`INSERT INTO field_coordinator_schools(coordinator_user_id, school_id)
       VALUES($1, $2)
       ON CONFLICT DO NOTHING`, [fcUserId, schoolId]);
        // 4. Create sample verified assessment with school resources, gaps, and requirements
        const idempotencyKey = '11111111-2222-3333-4444-555555555555';
        let asm = await c.query('SELECT assessment_id FROM assessments WHERE school_id=$1 AND idempotency_key=$2', [schoolId, idempotencyKey]);
        let assessmentId;
        if (!asm.rowCount) {
            const a = await c.query(`INSERT INTO assessments(school_id, submitted_by, assessment_date, idempotency_key, version_number, status, verified_by, verified_at)
         VALUES($1, $2, '2026-10-10', $3, 1, 'VERIFIED', $4, now())
         RETURNING assessment_id`, [schoolId, schoolUserId, idempotencyKey, adminId]);
            assessmentId = a.rows[0].assessment_id;
        }
        else {
            assessmentId = asm.rows[0].assessment_id;
        }
        // Sample school resource assessments
        const assessmentData = [
            {
                resource: 'Compound Optical Microscope',
                required: 20,
                available: 4,
                functional: 4,
                condition: 'GOOD',
                alternative: 'NONE',
                studentsAffected: 450,
            },
            {
                resource: 'Borosilicate Test Tube Set (Pack of 50)',
                required: 30,
                available: 15,
                functional: 10,
                condition: 'FAIR',
                alternative: 'NONE',
                studentsAffected: 380,
            },
            {
                resource: 'Optics Bench & Glass Prism Kit',
                required: 12,
                available: 2,
                functional: 2,
                condition: 'GOOD',
                alternative: 'NONE',
                studentsAffected: 300,
            },
            {
                resource: 'Acid-Base Titration Apparatus',
                required: 15,
                available: 5,
                functional: 3,
                condition: 'FAIR',
                alternative: 'NONE',
                studentsAffected: 250,
            },
            {
                resource: 'Desktop PC / Thin Client Workstation',
                required: 25,
                available: 10,
                functional: 8,
                condition: 'FAIR',
                alternative: 'PARTIAL',
                studentsAffected: 450,
            },
        ];
        for (const item of assessmentData) {
            const resId = resourceMap.get(item.resource);
            if (!resId)
                continue;
            // School resource
            const sr = await c.query(`INSERT INTO school_resources(assessment_id, resource_id, required_qty, available_qty, functional_qty, condition_rating, has_alternative, students_affected)
         VALUES($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT(assessment_id, resource_id) DO UPDATE SET
           required_qty=EXCLUDED.required_qty,
           available_qty=EXCLUDED.available_qty,
           functional_qty=EXCLUDED.functional_qty,
           condition_rating=EXCLUDED.condition_rating
         RETURNING school_resource_id`, [assessmentId, resId, item.required, item.available, item.functional, item.condition, item.alternative, item.studentsAffected]);
            const srId = sr.rows[0].school_resource_id;
            // Gap
            const gap = (0, gap_engine_1.calculateGap)(item.required, item.functional);
            const gapRow = await c.query(`INSERT INTO gap_records(school_resource_id, gap_qty, gap_ratio, computed_at)
         VALUES($1, $2, $3, now())
         ON CONFLICT(school_resource_id) DO UPDATE SET gap_qty=EXCLUDED.gap_qty, gap_ratio=EXCLUDED.gap_ratio, computed_at=now()
         RETURNING gap_id`, [srId, gap.gapQty, gap.gapRatio]);
            const gapId = gapRow.rows[0].gap_id;
            if (gap.gapQty > 0) {
                // Priority Score
                const catInfo = await c.query('SELECT rc.importance_weight FROM resources r JOIN resource_categories rc USING(category_id) WHERE r.resource_id=$1', [resId]);
                const importance = catInfo.rows[0]?.importance_weight ?? 80;
                const score = (0, priority_engine_1.calculatePriority)({
                    gapRatio: gap.gapRatio,
                    importance: Number(importance),
                    studentsAffected: item.studentsAffected,
                    maxStudentsAffected: 450,
                    alternative: item.alternative,
                    condition: item.condition,
                    config: weightCfg,
                });
                const psRow = await c.query(`INSERT INTO priority_scores(school_resource_id, weight_config_id, severity_score, importance_score, students_score, alternative_score, condition_score, final_score, priority_class, computed_at)
           VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
           RETURNING score_id`, [srId, configId, score.severity, score.importance, score.students, score.alternative, score.condition, score.finalScore, score.priorityClass]);
                const scoreId = psRow.rows[0].score_id;
                // Requirement
                const existingReq = await c.query('SELECT requirement_id FROM requirements WHERE school_id=$1 AND resource_id=$2 AND status<>\'CLOSED\'', [schoolId, resId]);
                if (!existingReq.rowCount) {
                    await c.query(`INSERT INTO requirements(school_id, resource_id, gap_id, score_id, accepted_gap_qty, status)
             VALUES($1, $2, $3, $4, $5, 'OPEN')`, [schoolId, resId, gapId, scoreId, gap.gapQty]);
                }
            }
        }
        // Mark one requirement as ACCEPTED by the test NGO to show NGO intervention tracking
        const acceptedTarget = await c.query(`SELECT r.requirement_id FROM requirements r
       JOIN resources res USING(resource_id)
       WHERE r.school_id=$1 AND res.name='Borosilicate Test Tube Set (Pack of 50)' AND r.status='OPEN'
       LIMIT 1`, [schoolId]);
        if (acceptedTarget.rowCount) {
            const reqId = acceptedTarget.rows[0].requirement_id;
            await c.query(`UPDATE requirements
         SET status='ACCEPTED', assigned_org_id=$2, version=version+1
         WHERE requirement_id=$1`, [reqId, orgId]);
            await c.query(`INSERT INTO interventions(requirement_id, org_id, action_description, status_at_entry, updated_by, comments)
         VALUES($1, $2, 'Accepted requirement by Science For All Foundation', 'ACCEPTED', $3, 'Procurement order placed for 20 packs')`, [reqId, orgId, ngoUserId]);
        }
        // 5. Sample User Feedback
        await c.query(`INSERT INTO user_feedback(submitted_by, category, target_name, rating, comments, school_id)
       VALUES($1, 'EQUIPMENT', 'Compound Optical Microscope', 5, 'The microscopes are of excellent quality and helped students with biology practicals.', $2)
       ON CONFLICT DO NOTHING`, [schoolUserId, schoolId]);
    });
    process.stdout.write('Demo seed completed successfully!\n');
    process.stdout.write('\nTest Accounts:\n');
    process.stdout.write('  Administrator: admin@scienceonwheels.in / Password123\n');
    process.stdout.write('  School:        school@scienceonwheels.in / Password123\n');
    process.stdout.write('  NGO:           ngo@scienceonwheels.in / Password123\n');
    process.stdout.write('  Field Coord:   fc@scienceonwheels.in / Password123\n\n');
}
seedTestData()
    .then(() => pool_1.pool.end())
    .catch(async (error) => {
    console.error('Seed failed:', error);
    await pool_1.pool.end();
    process.exitCode = 1;
});
