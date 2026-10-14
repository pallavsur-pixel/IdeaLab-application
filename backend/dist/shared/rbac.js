"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.canNgoViewRequirement = canNgoViewRequirement;
exports.schoolVisibleInterventions = schoolVisibleInterventions;
exports.schoolVisibleFeedback = schoolVisibleFeedback;
exports.schoolVisibleRequirement = schoolVisibleRequirement;
/** NGO visibility is global for unassigned, active opportunities and private for assigned work. */
function canNgoViewRequirement(row, orgId, orgVerified) {
    if (!orgId || !orgVerified || row.school_verification !== 'VERIFIED' || row.assessment_status !== 'VERIFIED')
        return false;
    if (row.assigned_org_id === orgId)
        return true;
    return row.assigned_org_id === null && ['OPEN', 'UNDER_REVIEW'].includes(row.status);
}
function schoolVisibleInterventions(rows) {
    return (rows ?? []).map(({ status_at_entry, created_at }) => ({ status_at_entry, created_at }));
}
function schoolVisibleFeedback(rows) {
    return (rows ?? []).filter((row) => row.source === 'SCHOOL');
}
function schoolVisibleRequirement(row) {
    const { assigned_org_id: _assignedOrg, data_changed_since_acceptance: _ngoWorkflowFlag, ...visible } = row;
    return visible;
}
