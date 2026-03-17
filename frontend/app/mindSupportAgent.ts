// frontend/app/mindSupportAgent.ts
import { callGemini, extractJSON, getHelplinesByCrisisLevel, getExerciseByCrisisLevel, generateWhatsAppLink } from "./mindUtils";
import {
    DETECT_EMOTIONAL_STATE_PROMPT,
    GENERATE_SUPPORT_RESPONSE_PROMPT,
    GENERATE_CHECKIN_MESSAGES_PROMPT
} from "./mindPrompts";

export type mindSupportResult = {
    emotionalAssessment: any | null;
    supportiveResponse: string | null;
    helplines: any[] | null;
    exercise: any | null;
    checkInReminder: any | null;
    crisisLevel: "SEVERE" | "HIGH" | "MODERATE" | "LOW" | null;
    requiresImmediateHelp: boolean;
    loadingPhase: "detecting" | "generating" | "done";
    errors: Record<string, string>;
    generatedAt: number;
};

export async function runMindAgent(
    userMessage: string,
    onProgress?: (phase: keyof Omit<mindSupportResult, "errors" | "loadingPhase">, data: any) => void
): Promise<mindSupportResult> {

    const result: mindSupportResult = {
        emotionalAssessment: null,
        supportiveResponse: null,
        helplines: null,
        exercise: null,
        checkInReminder: null,
        crisisLevel: null,
        requiresImmediateHelp: false,
        loadingPhase: "detecting",
        errors: {},
        generatedAt: Date.now()
    };

    try {
        // STEP 1: DETECT EMOTION
        const detectPrompt = DETECT_EMOTIONAL_STATE_PROMPT.replace("{{USER_MESSAGE}}", userMessage);
        const detectResRaw = await callGemini(detectPrompt);
        const detection = extractJSON(detectResRaw);

        result.emotionalAssessment = detection;
        result.crisisLevel = detection?.crisisLevel || "MODERATE"; // Fallback safe
        if (result.crisisLevel === "SEVERE" || detection?.requiresImmediateHelp === true) {
            result.requiresImmediateHelp = true;
        }

        onProgress?.("emotionalAssessment", result.emotionalAssessment);
        result.loadingPhase = "generating";

        // IMPORTANT STRICT RULE: If Severe, Do NOT generate exercises or check-in reminders.
        const isSevere = result.requiresImmediateHelp || result.crisisLevel === "SEVERE";

        // STEP 2: GENERATE SUPPORT MESSAGE
        const supportPrompt = GENERATE_SUPPORT_RESPONSE_PROMPT
            .replace("{{USER_MESSAGE}}", userMessage)
            .replace("{{CRISIS_LEVEL}}", result.crisisLevel || "MODERATE");

        // STEP 3: BUILD HELPLINES & EXERCISE (Static)
        result.helplines = getHelplinesByCrisisLevel(result.crisisLevel || "LOW");
        result.exercise = getExerciseByCrisisLevel(result.crisisLevel || "HIGH");

        onProgress?.("helplines", result.helplines);
        onProgress?.("exercise", result.exercise);

        // PARALLEL EXECUTION FOR REMAINING LLM CALLS
        const promises: Promise<any>[] = [
            callGemini(supportPrompt).then(res => ({ type: "supportiveResponse", data: res }))
        ];

        if (!isSevere) {
            const reminderPrompt = GENERATE_CHECKIN_MESSAGES_PROMPT.replace("{{USER_MESSAGE}}", userMessage);
            promises.push(
                callGemini(reminderPrompt).then(res => ({ type: "checkInReminder", data: extractJSON(res) }))
            );
        }

        const parallelResults = await Promise.allSettled(promises);

        for (const res of parallelResults) {
            if (res.status === "fulfilled") {
                const { type, data } = res.value;
                if (type === "supportiveResponse") {
                    result.supportiveResponse = data;
                    onProgress?.("supportiveResponse", result.supportiveResponse);
                } else if (type === "checkInReminder") {
                    result.checkInReminder = data;

                    // Add the whatsapp link if the reminder schema worked
                    if (result.checkInReminder && result.checkInReminder.defaultTime) {
                        const messageEncoded = "Hi ATLAS I would like to receive daily check-in messages";
                        result.checkInReminder.whatsappOptInLink = generateWhatsAppLink(messageEncoded);
                    }
                    onProgress?.("checkInReminder", result.checkInReminder);
                }
            } else {
                console.error("Mind Support Agent Parallel Request Failed:", res.reason);
            }
        }

    } catch (err: any) {
        result.errors.general = `Failed to execute mind support protocol: ${err.message}`;
    }

    result.loadingPhase = "done";
    return result;
}
