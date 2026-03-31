import { callGemini, extractJSON } from "./shieldUtils";
import {
    ANALYZE_THREAT_PROMPT,
    DETAILED_RISK_PROMPT,
    SAFETY_ACTION_PROMPT
} from "./shieldPrompts";

export type ShieldRescueResult = {
    threatLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | "SAFE" | null;
    category: string | null;
    redFlags: string[] | null;
    detailedRisk: string | null;
    safetyAction: string | null;
    errors: Record<string, string>;
};

export async function runShieldAgent(
    userMessage: string,
    onProgress?: (phase: keyof Omit<ShieldRescueResult, "errors">, data: any) => void
): Promise<ShieldRescueResult> {

    const result: ShieldRescueResult = {
        threatLevel: null,
        category: null,
        redFlags: null,
        detailedRisk: null,
        safetyAction: null,
        errors: {}
    };

    try {
        // STEP 1 - Analyze Threat (Sequential step because others depend on it)
        const analyzePrompt = ANALYZE_THREAT_PROMPT.replace("{{USER_MESSAGE}}", userMessage);
        const analyzeRaw = await callGemini(analyzePrompt);
        const analysis = extractJSON(analyzeRaw);

        result.threatLevel = analysis.threatLevel;
        result.category = analysis.category;
        result.redFlags = analysis.redFlags || [];

        onProgress?.("threatLevel", result.threatLevel);
        onProgress?.("category", result.category);
        onProgress?.("redFlags", result.redFlags);

        // STEP 2 & 3 - Run Detailed Risk & Action Plan in parallel
        const riskPrompt = DETAILED_RISK_PROMPT
            .replace("{{CATEGORY}}", result.category || "Unknown")
            .replace("{{RED_FLAGS}}", JSON.stringify(result.redFlags))
            .replace("{{USER_MESSAGE}}", userMessage);

        const actionPrompt = SAFETY_ACTION_PROMPT
            .replace("{{CATEGORY}}", result.category || "Unknown")
            .replace("{{USER_MESSAGE}}", userMessage);

        const [riskRes, actionRes] = await Promise.allSettled([
            callGemini(riskPrompt),
            callGemini(actionPrompt)
        ]);

        if (riskRes.status === "fulfilled") {
            result.detailedRisk = riskRes.value;
            onProgress?.("detailedRisk", result.detailedRisk);
        } else {
            result.errors.detailedRisk = riskRes.reason.message;
        }

        if (actionRes.status === "fulfilled") {
            result.safetyAction = actionRes.value;
            onProgress?.("safetyAction", result.safetyAction);
        } else {
            result.errors.safetyAction = actionRes.reason.message;
        }

    } catch (err: any) {
        result.errors.general = `Failed to analyze security threat: ${err.message}`;
    }

    return result;
}
