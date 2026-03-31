// frontend/app/reportCompiler.ts
import { AgentResults } from "./agentRouter";

export type CrisisReport = {
    emotionDetected: string;
    problemsFound: string[];
    agentsFired: string[];
    careerHelp: any | null;
    legalHelp: any | null;
    financeHelp: any | null;
    healthHelp: any | null;
    mindSupport: any | null;
    shieldHelp: any | null;
    generatedAt: number;
    sessionId: string;
};

export function compileReport(
    agentResults: AgentResults,
    emotionTag: string,
    detectedProblems: string[],
    agentsFired: string[]
): CrisisReport {
    return {
        emotionDetected: emotionTag,
        problemsFound: detectedProblems,
        agentsFired: agentsFired,
        careerHelp: agentResults.careerHelp,
        legalHelp: agentResults.legalHelp,
        financeHelp: agentResults.financeHelp,
        healthHelp: agentResults.healthHelp,
        mindSupport: agentResults.mindSupport,
        shieldHelp: agentResults.shieldHelp,
        generatedAt: Date.now(),
        sessionId: `session_${Date.now()}_${Math.random().toString(36).substring(7)}`
    };
}
