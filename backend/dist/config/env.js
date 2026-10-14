"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
function required(name, fallback) {
    const value = process.env[name] ?? fallback;
    if (!value)
        throw new Error(`Missing environment variable ${name}`);
    return value;
}
exports.env = {
    nodeEnv: process.env.NODE_ENV ?? 'development',
    port: Number(process.env.PORT ?? 3000),
    databaseUrl: required('DATABASE_URL', process.env.NODE_ENV === 'test' ? 'postgres://localhost:5432/test' : undefined),
    accessSecret: required('JWT_ACCESS_SECRET', process.env.NODE_ENV === 'test' ? 'test-access-secret-12345678901234567890' : undefined),
    refreshSecret: required('JWT_REFRESH_SECRET', process.env.NODE_ENV === 'test' ? 'test-refresh-secret-12345678901234567890' : undefined),
    redisUrl: process.env.REDIS_URL ?? '',
    autoCloseDays: Number(process.env.AUTO_CLOSE_DAYS ?? 14),
    corsOrigins: (process.env.CORS_ALLOWED_ORIGINS ?? 'http://localhost:5173,https://localhost')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.AI_API_KEY || '',
    geminiModel: process.env.GEMINI_MODEL || process.env.AI_MODEL || 'gemini-1.5-flash',
    aiApiKey: process.env.AI_API_KEY || process.env.GEMINI_API_KEY || '',
    aiApiBaseUrl: (process.env.AI_API_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/$/, ''),
    aiModel: process.env.AI_MODEL || process.env.GEMINI_MODEL || '',
    supabaseUrl: process.env.SUPABASE_URL ?? '',
    supabaseAnonKey: process.env.SUPABASE_ANON_KEY ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
};
