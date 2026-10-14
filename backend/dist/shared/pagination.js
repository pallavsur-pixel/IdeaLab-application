"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pagination = pagination;
exports.paged = paged;
const errors_1 = require("./errors");
function pagination(req) {
    const page = Number(req.query.page ?? 1);
    const pageSize = Number(req.query.page_size ?? 20);
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new errors_1.ApiError(400, 'INVALID_PAGINATION', 'page must be positive and page_size must be between 1 and 100.');
    }
    return { page, pageSize, offset: (page - 1) * pageSize };
}
function paged(data, page, pageSize, totalCount) {
    return { data, page, page_size: pageSize, total_count: Number(totalCount) };
}
