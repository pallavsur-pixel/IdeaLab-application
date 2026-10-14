"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAuthorizedContext = getAuthorizedContext;
exports.callGemini = callGemini;
exports.callOpenAiCompatible = callOpenAiCompatible;
exports.checkRateLimit = checkRateLimit;
const pool_1 = require("../../db/pool");
/**
 * Fetch authorized real application data for the current user to ground the AI response.
 * Never exposes unauthorized or cross-tenant records.
 */
async function getAuthorizedContext(userId, role) {
    const sources = ['Science on Wheels Knowledge Base'];
    const lines = [`User Role: ${role}`];
    try {
        if (role === 'SCHOOL') {
            const schoolQ = await pool_1.pool.query('SELECT school_id, school_name, district, state, verification_status, student_strength_total FROM schools WHERE user_id=$1', [userId]);
            if (schoolQ.rowCount) {
                const s = schoolQ.rows[0];
                lines.push(`Registered School: ${s.school_name} (District: ${s.district}, State: ${s.state}, Status: ${s.verification_status}, Students: ${s.student_strength_total})`);
                sources.push('School Profile Records');
                const reqsQ = await pool_1.pool.query(`SELECT res.name AS resource_name, rc.name AS category_name, g.gap_qty, ps.priority_class, ps.final_score, r.status, r.fulfilled_qty, r.accepted_gap_qty
           FROM requirements r
           JOIN resources res USING(resource_id)
           JOIN resource_categories rc USING(category_id)
           JOIN gap_records g USING(gap_id)
           JOIN priority_scores ps ON ps.score_id=r.score_id
           WHERE r.school_id=$1 AND r.status<>'CLOSED'
           ORDER BY ps.final_score DESC LIMIT 10`, [s.school_id]);
                if (reqsQ.rowCount) {
                    lines.push(`Active Outstanding Requirements for ${s.school_name}:`);
                    for (const row of reqsQ.rows) {
                        lines.push(`- ${row.resource_name} (${row.category_name}): Gap=${row.gap_qty}, Priority=${row.priority_class} (Score: ${row.final_score}), Status=${row.status}, Fulfilled=${row.fulfilled_qty}/${row.accepted_gap_qty}`);
                    }
                    sources.push('Live School Requirements');
                }
                else {
                    lines.push(`No active outstanding requirements found for ${s.school_name}.`);
                }
                const asmQ = await pool_1.pool.query(`SELECT assessment_id, assessment_date, status, created_at
           FROM assessments WHERE school_id=$1 ORDER BY created_at DESC LIMIT 3`, [s.school_id]);
                if (asmQ.rowCount) {
                    lines.push('Recent Assessments:');
                    for (const a of asmQ.rows) {
                        lines.push(`- Date: ${a.assessment_date}, Status: ${a.status}`);
                    }
                    sources.push('Assessment History');
                }
            }
            else {
                lines.push('No school profile registered yet for this account.');
            }
        }
        else if (role === 'NGO') {
            const orgQ = await pool_1.pool.query('SELECT org_id, org_name, verification_status, focus_areas, service_districts FROM organizations WHERE user_id=$1', [userId]);
            if (orgQ.rowCount) {
                const o = orgQ.rows[0];
                lines.push(`Organization: ${o.org_name} (Verification: ${o.verification_status})`);
                sources.push('Organization Profile');
                if (o.verification_status === 'VERIFIED') {
                    const openQ = await pool_1.pool.query(`SELECT count(*)::int AS count FROM requirements r
             JOIN schools s USING(school_id)
             WHERE r.status IN ('OPEN','UNDER_REVIEW') AND r.assigned_org_id IS NULL AND s.verification_status='VERIFIED'`);
                    lines.push(`Available Verified Public Requirements: ${openQ.rows[0]?.count ?? 0} requirements awaiting NGO intervention.`);
                    const myInterventionsQ = await pool_1.pool.query(`SELECT r.requirement_id, res.name AS resource_name, s.school_name, s.district, r.status, r.fulfilled_qty, r.accepted_gap_qty
             FROM requirements r
             JOIN schools s USING(school_id)
             JOIN resources res USING(resource_id)
             WHERE r.assigned_org_id=$1 AND r.status NOT IN ('COMPLETED','CLOSED')
             ORDER BY r.updated_at DESC LIMIT 5`, [o.org_id]);
                    if (myInterventionsQ.rowCount) {
                        lines.push(`Your Active Interventions:`);
                        for (const row of myInterventionsQ.rows) {
                            lines.push(`- ${row.school_name} (${row.district}): ${row.resource_name} - Status: ${row.status}, Progress: ${row.fulfilled_qty}/${row.accepted_gap_qty}`);
                        }
                        sources.push('NGO Interventions');
                    }
                }
            }
        }
        else if (role === 'ADMIN') {
            const statsQ = await pool_1.pool.query(`
        SELECT
          (SELECT count(*)::int FROM schools) AS total_schools,
          (SELECT count(*)::int FROM schools WHERE verification_status='VERIFIED') AS verified_schools,
          (SELECT count(*)::int FROM requirements WHERE status<>'CLOSED') AS active_requirements,
          (SELECT count(*)::int FROM requirements r JOIN priority_scores ps ON ps.score_id=r.score_id WHERE r.status<>'CLOSED' AND ps.priority_class='CRITICAL') AS critical_requirements,
          (SELECT count(*)::int FROM organizations WHERE verification_status='VERIFIED') AS verified_ngos
      `);
            const s = statsQ.rows[0];
            lines.push(`Platform-wide Statistics: Total Schools: ${s.total_schools} (Verified: ${s.verified_schools}), Active Requirements: ${s.active_requirements} (Critical: ${s.critical_requirements}), Verified NGOs: ${s.verified_ngos}`);
            sources.push('Administrative Platform Statistics');
        }
    }
    catch (err) {
        // If database lookup fails, continue with base platform context
        console.warn('[Assistant Context] Could not load database context:', err);
    }
    return { role, contextText: lines.join('\n'), sources };
}
/**
 * Call Google Gemini API (generateContent)
 */
async function callGemini(prompt, systemInstruction, apiKey, model = 'gemini-1.5-flash') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
        contents: [
            {
                role: 'user',
                parts: [{ text: prompt }],
            },
        ],
        systemInstruction: {
            parts: [{ text: systemInstruction }],
        },
        generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 800,
        },
    };
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`Gemini API returned ${response.status}: ${errorText.slice(0, 200)}`);
    }
    const payload = await response.json();
    const text = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text)
        throw new Error('Gemini API returned an empty response');
    return text;
}
/**
 * Fallback to OpenAI-compatible Chat Completions if configured
 */
async function callOpenAiCompatible(prompt, systemInstruction, apiKey, baseUrl, model) {
    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        signal: AbortSignal.timeout(20000),
        body: JSON.stringify({
            model,
            temperature: 0.3,
            max_tokens: 600,
            messages: [
                { role: 'system', content: systemInstruction },
                { role: 'user', content: prompt },
            ],
        }),
    });
    if (!response.ok)
        throw new Error(`AI model returned ${response.status}`);
    const payload = await response.json();
    const answer = payload.choices?.[0]?.message?.content?.trim();
    if (!answer)
        throw new Error('Model returned an empty answer');
    return answer;
}
// In-memory rate limiting map: userId -> timestamps array
const rateLimitMap = new Map();
function checkRateLimit(userId, limit = 20, windowMs = 60000) {
    const now = Date.now();
    const timestamps = (rateLimitMap.get(userId) ?? []).filter((t) => now - t < windowMs);
    if (timestamps.length >= limit)
        return false;
    timestamps.push(now);
    rateLimitMap.set(userId, timestamps);
    return true;
}
