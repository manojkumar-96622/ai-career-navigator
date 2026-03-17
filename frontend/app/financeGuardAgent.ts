// frontend/app/financeGuardAgent.ts
import { callGemini, extractJSON } from "./financeUtils";
import {
    EXTRACT_FINANCE_PROFILE_PROMPT,
    FIND_SCHEMES_PROMPT,
    BUILD_BUDGET_PROMPT,
    EMI_RESTRUCTURE_PROMPT
} from "./financePrompts";

export type GovernmentScheme = {
    schemeName: string;
    benefit: string;
    exactEligibility: string;
    documentsNeeded: string[];
    whereToApply: string;
    applicationLink: string;
    timeToBenefit: string;
};

export type SurvivalBudget = {
    incomeThisMonth: {
        currentIncome: number;
        emergencyFund: number;
        expectedSchemeBenefit: number;
        totalAvailable: number;
    };
    essentialExpenses: {
        foodAndGroceries: number;
        rentOrHousing: number;
        utilities: number;
        schoolFees: number;
        medicines: number;
        minimumEMI: number;
    };
    nonEssentialExpensesToCut: Array<{ item: string; estimatedSavings: number }>;
    summary: {
        totalAvailable: number;
        totalEssential: number;
        remainingAmount: number;
        survivalStatus: "Safe" | "Tight" | "Critical";
    };
    moneySavingTips: string[];
};

export type EmiPlan = {
    step1Moratorium: string;
    step2Restructuring: string;
    step3BankVisitScript: string;
    step4WrittenApplication: string;
    step5RbiOmbudsman: string;
};

export type FinanceRescueResult = {
    extractedProfile: any | null;
    qualifiedSchemes: GovernmentScheme[] | null;
    survivalBudget: SurvivalBudget | null;
    emiPlan: EmiPlan | null;
    loadingPhase: "profile" | "schemes" | "budget" | "emi" | "done";
    errors: Record<string, string>;
};

export async function runFinanceAgent(
    userMessage: string,
    onProgress?: (phase: keyof Omit<FinanceRescueResult, "errors" | "loadingPhase">, data: any) => void
): Promise<FinanceRescueResult> {

    const result: FinanceRescueResult = {
        extractedProfile: null,
        qualifiedSchemes: null,
        survivalBudget: null,
        emiPlan: null,
        loadingPhase: "profile",
        errors: {}
    };

    try {
        // STEP 1 - Extract Financial Profile (Sequential because steps 2,3,4 depend on this)
        const profilePrompt = EXTRACT_FINANCE_PROFILE_PROMPT.replace("{{USER_MESSAGE}}", userMessage);
        const profileRaw = await callGemini(profilePrompt);
        const profile = extractJSON(profileRaw);

        result.extractedProfile = profile;
        onProgress?.("extractedProfile", result.extractedProfile);

        // Define dependent prompts using the extracted profile
        const profileString = JSON.stringify(profile);

        const schemePrompt = FIND_SCHEMES_PROMPT.replace("{{PROFILE}}", profileString);
        const budgetPrompt = BUILD_BUDGET_PROMPT.replace("{{PROFILE}}", profileString);
        const emiPrompt = EMI_RESTRUCTURE_PROMPT.replace("{{PROFILE}}", profileString);

        // STEP 2, 3, 4 - Run in parallel. Backend Rate Limiter will safely space these out.
        const promises: Promise<any>[] = [
            callGemini(schemePrompt).then(res => ({ type: "schemes", data: res })),
            callGemini(budgetPrompt).then(res => ({ type: "budget", data: res })),
        ];

        // Only generate EMI plan if loans are mentioned
        const loansStr = String(profile.loans || "");
        const hasLoans = profile.loans && loansStr.toLowerCase() !== "unknown" && loansStr.toLowerCase() !== "none" && loansStr.trim() !== "";
        if (hasLoans) {
            promises.push(callGemini(emiPrompt).then(res => ({ type: "emi", data: res })));
        }

        const parallelResults = await Promise.allSettled(promises);

        for (const res of parallelResults) {
            if (res.status === "fulfilled") {
                const { type, data } = res.value;
                try {
                    const parsedData = extractJSON(data);
                    if (type === "schemes") {
                        result.qualifiedSchemes = parsedData;
                        onProgress?.("qualifiedSchemes", result.qualifiedSchemes);
                    } else if (type === "budget") {
                        result.survivalBudget = parsedData;
                        onProgress?.("survivalBudget", result.survivalBudget);
                    } else if (type === "emi") {
                        result.emiPlan = parsedData;
                        onProgress?.("emiPlan", result.emiPlan);
                    }
                } catch (e: any) {
                    result.errors[type] = `Failed to parse ${type}: ` + e.message;
                }
            } else {
                // Log promise rejection (like API failures)
                console.error("Finance Agent Parallel Request Failed:", res.reason);
            }
        }

    } catch (err: any) {
        result.errors.general = `Failed to execute financial crisis protocol: ${err.message}`;
    }

    result.loadingPhase = "done";
    return result;
}
