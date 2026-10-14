"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.authenticate = authenticate;
exports.allow = allow;
exports.canAccessSchool = canAccessSchool;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../config/env");
const pool_1 = require("../db/pool");
const errors_1 = require("../shared/errors");
async function authenticate(req, _res, next) {
    try {
        const header = req.header('authorization');
        if (!header?.startsWith('Bearer '))
            throw new errors_1.ApiError(401, 'UNAUTHENTICATED', 'A bearer access token is required.');
        const payload = jsonwebtoken_1.default.verify(header.slice(7), env_1.env.accessSecret);
        const result = await pool_1.pool.query('SELECT user_id,role,is_active FROM users WHERE user_id=$1', [payload.sub]);
        if (!result.rowCount)
            throw new errors_1.ApiError(401, 'UNAUTHENTICATED', 'Access token is invalid.');
        if (!result.rows[0].is_active)
            throw new errors_1.ApiError(403, 'INACTIVE_ACCOUNT', 'Account is inactive.');
        req.principal = { userId: result.rows[0].user_id, role: result.rows[0].role };
        next();
    }
    catch (error) {
        next(error instanceof jsonwebtoken_1.default.JsonWebTokenError ? new errors_1.ApiError(401, 'UNAUTHENTICATED', 'Access token is invalid or expired.') : error);
    }
}
function allow(...roles) {
    return (req, _res, next) => {
        if (!req.principal)
            return next(new errors_1.ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.'));
        if (!roles.includes(req.principal.role))
            return next(new errors_1.ApiError(403, 'FORBIDDEN', 'You are not allowed to perform this action.'));
        next();
    };
}
async function canAccessSchool(userId, role, schoolId) {
    if (role === 'ADMIN')
        return true;
    if (role === 'SCHOOL') {
        const r = await pool_1.pool.query('SELECT 1 FROM schools WHERE school_id=$1 AND user_id=$2', [schoolId, userId]);
        return !!r.rowCount;
    }
    if (role === 'FIELD_COORDINATOR') {
        const r = await pool_1.pool.query('SELECT 1 FROM field_coordinator_schools WHERE school_id=$1 AND coordinator_user_id=$2', [schoolId, userId]);
        return !!r.rowCount;
    }
    return false;
}
