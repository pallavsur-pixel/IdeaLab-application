"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculatePriority = calculatePriority;
const alternativeScores = { NONE: 100, PARTIAL: 50, FULL: 0 };
const conditionScores = { GOOD: 0, FAIR: 50, POOR: 100, NOT_APPLICABLE: 100 };
function calculatePriority(input) {
    const severity = input.gapRatio * 100;
    const students = input.maxStudentsAffected > 0 ? Math.min(input.studentsAffected / input.maxStudentsAffected * 100, 100) : 0;
    const alternative = alternativeScores[input.alternative];
    const condition = conditionScores[input.condition];
    if (alternative === undefined || condition === undefined)
        throw new Error('Unsupported priority input');
    const c = input.config;
    const finalScore = c.severity_weight * severity + c.importance_weight * input.importance + c.students_weight * students + c.alternative_weight * alternative + c.condition_weight * condition;
    const priorityClass = finalScore >= c.critical_threshold ? 'CRITICAL' : finalScore >= c.high_threshold ? 'HIGH' : finalScore >= c.medium_threshold ? 'MEDIUM' : 'LOW';
    return { severity: round(severity), importance: round(input.importance), students: round(students), alternative: round(alternative), condition: round(condition), finalScore: round(finalScore), priorityClass };
}
function round(n) { return Math.round(n * 100) / 100; }
