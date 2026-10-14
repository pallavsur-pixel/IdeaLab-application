"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = __importDefault(require("node:test"));
const strict_1 = __importDefault(require("node:assert/strict"));
const rbac_1 = require("./rbac");
(0, node_test_1.default)('NGO can discover an unassigned opportunity across districts when school and assessment are verified', () => {
    strict_1.default.equal((0, rbac_1.canNgoViewRequirement)({ status: 'OPEN', assigned_org_id: null, school_verification: 'VERIFIED', assessment_status: 'VERIFIED' }, 'ngo-a', true), true);
});
(0, node_test_1.default)('NGO cannot view another organization’s assigned requirement or unverified data', () => {
    const row = { status: 'IN_PROGRESS', assigned_org_id: 'ngo-b', school_verification: 'VERIFIED', assessment_status: 'VERIFIED' };
    strict_1.default.equal((0, rbac_1.canNgoViewRequirement)(row, 'ngo-a', true), false);
    strict_1.default.equal((0, rbac_1.canNgoViewRequirement)({ ...row, assigned_org_id: null }, 'ngo-a', false), false);
    strict_1.default.equal((0, rbac_1.canNgoViewRequirement)({ ...row, school_verification: 'PENDING' }, 'ngo-a', true), false);
});
(0, node_test_1.default)('school-facing projections omit NGO private notes, identities, and non-school feedback', () => {
    strict_1.default.deepEqual((0, rbac_1.schoolVisibleInterventions)([{ status_at_entry: 'IN_PROGRESS', created_at: 'now', comments: 'private', org_id: 'ngo-b', updated_by: 'user-b' }]), [{ status_at_entry: 'IN_PROGRESS', created_at: 'now' }]);
    strict_1.default.deepEqual((0, rbac_1.schoolVisibleFeedback)([{ source: 'SCHOOL', comments: 'confirmed' }, { source: 'NGO', comments: 'private' }]), [{ source: 'SCHOOL', comments: 'confirmed' }]);
    strict_1.default.deepEqual((0, rbac_1.schoolVisibleRequirement)({ status: 'IN_PROGRESS', assigned_org_id: 'ngo-b', data_changed_since_acceptance: true, fulfilled_qty: 2 }), { status: 'IN_PROGRESS', fulfilled_qty: 2 });
});
