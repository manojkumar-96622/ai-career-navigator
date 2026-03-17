// frontend/app/healthNavigatorAgent.ts
import { callGemini, extractJSON } from "./healthUtils";
import {
    EXTRACT_HEALTH_PROFILE_PROMPT,
    FIND_HOSPITALS_PROMPT,
    CHECK_SCHEMES_PROMPT,
    FIND_DIAGNOSTICS_PROMPT,
    DRAFT_LEAVE_LETTER_PROMPT
} from "./healthPrompts";

export type Hospital = {
    hospitalName: string;
    hospitalType: "Government" | "Ayushman Empanelled" | "Private";
    address: string;
    speciality: string;
    whyRecommended: string;
    approximateCost: string;
    emergencyNumber: string;
    howToReach: string;
    mapSearchTerm: string;
};

export type SchemeEligibility = {
    schemeName: string;
    qualifies: "Yes" | "Possibly" | "No with reason";
    benefitAmount: string;
    howToVerify: string;
    documentsNeeded: string[];
    officialLink: string;
};

export type DiagnosticCenter = {
    centerType: string;
    freeServices: string[];
    whoQualifies: string;
    howToFind: string;
    timings: string;
};

export type LeaveLetters = {
    formalLetter: string;
    whatsappVersion: string;
};

export type HealthRescueResult = {
    extractedProfile: any | null;
    nearestHospitals: Hospital[] | null;
    schemeEligibility: SchemeEligibility[] | null;
    diagnosticCenters: DiagnosticCenter[] | null;
    leaveLetters: LeaveLetters | null;
    loadingPhase: "profile" | "hospitals" | "schemes" | "diagnostics" | "letter" | "done";
    errors: Record<string, string>;
    generatedAt: number;
};

export async function runHealthAgent(
    userMessage: string,
    onProgress?: (phase: keyof Omit<HealthRescueResult, "errors" | "loadingPhase">, data: any) => void
): Promise<HealthRescueResult> {

    const result: HealthRescueResult = {
        extractedProfile: null,
        nearestHospitals: null,
        schemeEligibility: null,
        diagnosticCenters: null,
        leaveLetters: null,
        loadingPhase: "profile",
        errors: {},
        generatedAt: Date.now()
    };

    try {
        // STEP 1 - Extract Health Profile (Sequential because steps 2,3,4,5 depend on this)
        const profilePrompt = EXTRACT_HEALTH_PROFILE_PROMPT.replace("{{USER_MESSAGE}}", userMessage);
        const profileRaw = await callGemini(profilePrompt);
        const profile = extractJSON(profileRaw);

        result.extractedProfile = profile;
        onProgress?.("extractedProfile", result.extractedProfile);

        // Define dependent prompts using the extracted profile
        const profileString = JSON.stringify(profile);

        const hospitalsPrompt = FIND_HOSPITALS_PROMPT.replace("{{PROFILE}}", profileString);
        const schemesPrompt = CHECK_SCHEMES_PROMPT.replace("{{PROFILE}}", profileString);
        const diagnosticsPrompt = FIND_DIAGNOSTICS_PROMPT.replace("{{PROFILE}}", profileString);
        const leavePrompt = DRAFT_LEAVE_LETTER_PROMPT.replace("{{PROFILE}}", profileString);

        // STEP 2, 3, 4, 5 - Run in parallel. Backend Rate Limiter will safely space these out.
        const promises: Promise<any>[] = [
            callGemini(hospitalsPrompt).then(res => ({ type: "nearestHospitals", data: res })),
            callGemini(schemesPrompt).then(res => ({ type: "schemeEligibility", data: res })),
            callGemini(diagnosticsPrompt).then(res => ({ type: "diagnosticCenters", data: res })),
        ];

        // Ensure we handle non-string employer names to prevent another generic bug like the finance agent
        const hasEmployer = profile.employerName && String(profile.employerName).toLowerCase() !== "unknown";
        const hasLeaveDays = profile.leaveDays && String(profile.leaveDays).toLowerCase() !== "unknown";

        // Let's generate it anyway as a template even if not strictly requested, 
        // because the user might just want the template with placeholders.
        promises.push(callGemini(leavePrompt).then(res => ({ type: "leaveLetters", data: res })));

        const parallelResults = await Promise.allSettled(promises);

        for (const res of parallelResults) {
            if (res.status === "fulfilled") {
                const { type, data } = res.value;
                try {
                    const parsedData = extractJSON(data);

                    if (type === "nearestHospitals") {
                        result.nearestHospitals = parsedData;
                        onProgress?.("nearestHospitals", result.nearestHospitals);
                    } else if (type === "schemeEligibility") {
                        result.schemeEligibility = parsedData;
                        onProgress?.("schemeEligibility", result.schemeEligibility);
                    } else if (type === "diagnosticCenters") {
                        result.diagnosticCenters = parsedData;
                        onProgress?.("diagnosticCenters", result.diagnosticCenters);
                    } else if (type === "leaveLetters") {
                        result.leaveLetters = parsedData;
                        onProgress?.("leaveLetters", result.leaveLetters);
                    }
                } catch (e: any) {
                    result.errors[type] = `Failed to parse ${type}: ` + e.message;
                }
            } else {
                console.error("Health Agent Parallel Request Failed:", res.reason);
            }
        }

    } catch (err: any) {
        result.errors.general = `Failed to execute health rescue protocol: ${err.message}`;
    }

    result.loadingPhase = "done";
    return result;
}
