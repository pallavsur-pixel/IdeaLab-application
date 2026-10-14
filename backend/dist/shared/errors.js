"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = exports.ApiError = void 0;
class ApiError extends Error {
    status;
    code;
    details;
    constructor(status, code, message, details) {
        super(message);
        this.status = status;
        this.code = code;
        this.details = details;
    }
}
exports.ApiError = ApiError;
const errorHandler = (error, _req, res, _next) => {
    if (error instanceof ApiError) {
        res.status(error.status).json({ error: { code: error.code, message: error.message, ...(error.details === undefined ? {} : { details: error.details }) } });
        return;
    }
    if (error?.name === 'ZodError') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.', details: error.issues?.map((issue) => ({ path: issue.path, message: issue.message })) } });
        return;
    }
    if (error?.code === '23505') {
        res.status(409).json({ error: { code: 'CONFLICT', message: 'A record with these values already exists.' } });
        return;
    }
    if (error?.code === '23503' || error?.code === '23514' || error?.code === '22P02') {
        res.status(400).json({ error: { code: 'INVALID_DATA', message: 'The request violates a data constraint.' } });
        return;
    }
    console.error(error);
    res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } });
};
exports.errorHandler = errorHandler;
