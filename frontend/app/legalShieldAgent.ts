import { callGemini, extractJSON } from "./legalUtils";
import {
    ANALYZE_SITUATION_PROMPT,
    EXPLAIN_RIGHTS_PROMPT,
    DRAFT_DOCUMENT_PROMPT,
    SUBMISSION_GUIDE_PROMPT
} from "./legalPrompts";

export type ApplicableLaw = {
    lawName: string;
    sectionNumber: string;
    explanation: string;
};

export type SubmissionGuide = {
    whereToGo: string;
    howToFindIt: string;
    documentsToCarry: string[];
    filingFee: string;
    timeLimit: string;
    whatHappensNext: string;
};

export type LegalRescueResult = {
    legalCategory: string | null;
    oppositeParty: string | null;
    harmDone: string | null;
    desiredOutcome: string | null;
    applicableLaws: ApplicableLaw[] | null;
    rightsExplanation: string | null;
    draftedDocument: string | null;
    submissionGuide: SubmissionGuide | null;
    errors: Record<string, string>;
};

export async function runLegalAgent(
    userMessage: string,
    onProgress?: (phase: keyof Omit<LegalRescueResult, "errors">, data: any) => void
): Promise<LegalRescueResult> {

    const result: LegalRescueResult = {
        legalCategory: null,
        oppositeParty: null,
        harmDone: null,
        desiredOutcome: null,
        applicableLaws: null,
        rightsExplanation: null,
        draftedDocument: null,
        submissionGuide: null,
        errors: {}
    };

    try {
        // STEP 1 - Analyze Situation
        const analyzePrompt = ANALYZE_SITUATION_PROMPT.replace("{{USER_MESSAGE}}", userMessage);
        const analyzeRaw = await callGemini(analyzePrompt);
        const analysis = extractJSON(analyzeRaw);

        result.legalCategory = analysis.legalCategory;
        result.oppositeParty = analysis.oppositeParty;
        result.harmDone = analysis.harmDone;
        result.desiredOutcome = analysis.desiredOutcome;
        result.applicableLaws = analysis.applicableLaws;

        onProgress?.("legalCategory", result.legalCategory);
        onProgress?.("applicableLaws", result.applicableLaws);

        if (!result.legalCategory) throw new Error("Could not determine legal category.");

        // STEP 2, 3, 4 - Run in parallel for speed! The Python backend will safely rate-limit these now.
        const rightsPrompt = EXPLAIN_RIGHTS_PROMPT
            .replace("{{CATEGORY}}", result.legalCategory)
            .replace("{{LAWS}}", JSON.stringify(result.applicableLaws))
            .replace("{{USER_MESSAGE}}", userMessage);

        const draftPrompt = DRAFT_DOCUMENT_PROMPT
            .replace("{{CATEGORY}}", result.legalCategory)
            .replace("{{USER_MESSAGE}}", userMessage);

        const guidePrompt = SUBMISSION_GUIDE_PROMPT
            .replace("{{CATEGORY}}", result.legalCategory)
            .replace("{{USER_MESSAGE}}", userMessage);

        const [rightsRes, draftRes, guideRes] = await Promise.allSettled([
            callGemini(rightsPrompt),
            callGemini(draftPrompt),
            callGemini(guidePrompt)
        ]);

        // Process Rights
        if (rightsRes.status === "fulfilled") {
            result.rightsExplanation = rightsRes.value;
            onProgress?.("rightsExplanation", result.rightsExplanation);
        } else {
            result.errors.rightsExplanation = rightsRes.reason.message;
        }

        // Process Document Draft
        if (draftRes.status === "fulfilled") {
            result.draftedDocument = draftRes.value;
            onProgress?.("draftedDocument", result.draftedDocument);
        } else {
            result.errors.draftedDocument = draftRes.reason.message;
        }

        // Process Submission Guide
        if (guideRes.status === "fulfilled") {
            try {
                const guide = extractJSON(guideRes.value);
                result.submissionGuide = guide;
                onProgress?.("submissionGuide", result.submissionGuide);
            } catch (e: any) {
                result.errors.submissionGuide = "Failed to parse guide JSON: " + e.message;
            }
        } else {
            result.errors.submissionGuide = guideRes.reason.message;
        }

    } catch (err: any) {
        result.errors.general = `Failed to analyze legal situation: ${err.message}`;
    }

    return result;
}
