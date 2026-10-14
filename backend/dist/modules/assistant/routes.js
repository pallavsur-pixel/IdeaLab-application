"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assistantRouter = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const env_1 = require("../../config/env");
const auth_1 = require("../../middleware/auth");
const faqs_1 = require("./faqs");
const gemini_1 = require("./gemini");
exports.assistantRouter = (0, express_1.Router)();
exports.assistantRouter.use(auth_1.authenticate);
exports.assistantRouter.post('/assistant/faq', async (req, res, next) => {
    try {
        const { question } = zod_1.z.object({ question: zod_1.z.string().trim().min(2).max(1000) }).parse(req.body);
        const userId = req.principal.userId;
        const role = req.principal.role;
        // Rate limiting: 20 requests per minute
        if (!(0, gemini_1.checkRateLimit)(userId, 20, 60000)) {
            return res.status(429).json({
                error: { code: 'RATE_LIMIT_EXCEEDED', message: 'You have submitted too many questions in a short period. Please wait a minute before asking again.' },
            });
        }
        const fallback = (0, faqs_1.findFaqAnswer)(question);
        // If neither Gemini nor OpenAI API is configured, return the verified FAQ fallback
        if (!env_1.env.geminiApiKey && !env_1.env.aiApiKey) {
            return res.json({
                ...fallback,
                answer: `${fallback.answer}\n\n(Note: Live AI responses require GEMINI_API_KEY configured in backend/.env. Returning verified knowledge base answer.)`,
                mode: 'FAQ',
            });
        }
        try {
            // 1. Retrieve authorized real application data context for the authenticated user
            const authCtx = await (0, gemini_1.getAuthorizedContext)(userId, role);
            // 2. Prepare comprehensive system instructions
            const systemInstruction = `You are the official AI Assistant for "Science on Wheels", a platform dedicated to assessing, calculating, prioritizing school science-resource gaps, and tracking NGO interventions.

PLATFORM WORKFLOW & RULES:
- Workflow: School Profile -> Resource Assessment -> Gap Calculation -> Priority Scoring -> Generated Requirements -> NGO Intervention & Delivery -> School Confirmation.
- Gap Formula: Resource Gap = max(required_quantity - functional_available_quantity, 0).
- Priority Scoring: Multi-factor score between 0 and 100 based on Severity (35%), Resource Importance (25%), Students Affected (20%), Alternative Availability (10%), and Resource Condition (10%).
  * Critical: score >= 80
  * High: 60 <= score < 80
  * Medium: 40 <= score < 60
  * Low: score < 40
- Requirement Lifecycle: OPEN -> UNDER_REVIEW -> ACCEPTED -> IN_PROGRESS -> PARTIALLY_COMPLETED -> COMPLETED -> CLOSED.
- NGO Rules: NGOs may accept requirements from verified schools. Only verified NGOs can accept interventions. Partial fulfillment updates progress without prematurely closing requirements.
- School Rules: Schools manage their own assessments, view their own requirements, and confirm delivery completion.

CURRENT AUTHENTICATED USER CONTEXT (Real database records for this user):
${authCtx.contextText}

VERIFIED KNOWLEDGE BASE / FAQS:
${faqs_1.faqs.map((faq) => `- ${faq.title}: ${faq.answer}`).join('\n')}

INSTRUCTIONS FOR YOUR RESPONSE:
1. Provide accurate, helpful, and concise answers grounded in the system rules and the verified user context above.
2. If the user asks about their specific school, requirements, or interventions, answer using the provided database context.
3. If specific requested information is not available in the context or belongs to another entity, explicitly state that it is not available or restricted by privacy rules. Never fabricate statistics, names, or quantities.
4. Keep tone professional, respectful, and supportive of educational resource equality.`;
            let answer = '';
            if (env_1.env.geminiApiKey) {
                answer = await (0, gemini_1.callGemini)(question, systemInstruction, env_1.env.geminiApiKey, env_1.env.geminiModel);
            }
            else if (env_1.env.aiApiKey) {
                answer = await (0, gemini_1.callOpenAiCompatible)(question, systemInstruction, env_1.env.aiApiKey, env_1.env.aiApiBaseUrl, env_1.env.aiModel);
            }
            if (!answer)
                throw new Error('Empty response from AI service');
            return res.json({
                answer,
                sources: authCtx.sources,
                mode: 'AI',
            });
        }
        catch (aiError) {
            console.warn('[AI Assistant Error]:', aiError);
            return res.json({
                ...fallback,
                mode: 'FAQ',
            });
        }
    }
    catch (error) {
        next(error);
    }
});
