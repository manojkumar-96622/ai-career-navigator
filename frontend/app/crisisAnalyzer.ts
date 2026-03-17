// frontend/app/crisisAnalyzer.ts
import { callGemini, extractJSON } from "./careerUtils"; // Reusing the robust backend caller & JSON parser

export type CrisisAnalysis = {
    detectedProblems: string[];
    activeAgents: string[];
};

const CRISIS_ANALYSIS_PROMPT = `
Read this crisis message carefully. 
Identify every problem the user is facing and think step-by-step about which agents are required.

Classify each problem into these categories: 
CAREER means job loss unemployment fired career change resume recruiter salary issues. 
LEGAL means rights violation unfair treatment legal notice police FIR consumer complaint landlord dispute workplace harassment RTI government complaint fraud cheated. 
FINANCE means money problems loan EMI debt rent no income government schemes subsidy bank issues financial help broke. 
HEALTH means sickness hospital doctor medical emergency insurance treatment medicine medical leave family member unwell. 
MIND means emotional distress stress anxiety hopelessness burnout mental health cannot cope feeling lost overwhelmed breaking down.

USER MESSAGE:
"{{USER_MESSAGE}}"

Return only this exact JSON and nothing else:
{
  "reasoning": "A brief explanation of why specific agents were chosen based on the extracted problems.",
  "detectedProblems": [
    "problem description 1",
    "problem description 2"
  ],
  "activeAgents": [
    "CareerRescueAgent",
    "FinanceGuardAgent"
  ]
}

Only include agents that are genuinely needed. If no career problem exists do not include CareerRescueAgent. Be precise.
`;

// Whitelist of strict agent names to prevent JSON hallucinations
const VALID_AGENTS = new Set([
    "CareerRescueAgent",
    "LegalShieldAgent",
    "FinanceGuardAgent",
    "HealthNavigatorAgent",
    "MindSupportAgent"
]);

export async function analyzeCrisis(userMessage: string): Promise<CrisisAnalysis> {
    const prompt = CRISIS_ANALYSIS_PROMPT.replace("{{USER_MESSAGE}}", userMessage);

    try {
        const responseText = await callGemini(prompt);
        let parsed = extractJSON(responseText);

        // Mitigation: If Gemini returns invalid JSON, default safely to all 5 agents.
        if (!parsed || !Array.isArray(parsed.activeAgents) || !Array.isArray(parsed.detectedProblems)) {
            console.warn("Crisis Analyzer Warning: Invalid JSON from LLM. Defaulting to all agents.");
            return {
                detectedProblems: ["Multiple unspecified compounding crisis factors detected."],
                activeAgents: Array.from(VALID_AGENTS)
            };
        }

        // Mitigation: Filter out any hallucinated agent names
        const sanitizedAgents = parsed.activeAgents.filter((agentName: string) => VALID_AGENTS.has(agentName));

        // If the LLM filtered out everything by accident, fail-safe to Mind Support just in case
        if (sanitizedAgents.length === 0) {
            sanitizedAgents.push("MindSupportAgent");
        }

        return {
            detectedProblems: parsed.detectedProblems,
            activeAgents: sanitizedAgents
        };

    } catch (error) {
        console.error("Crisis Analyzer Error:", error);
        // Absolute fail-safe: run everything
        return {
            detectedProblems: ["System could not parse specific problems, firing full suite."],
            activeAgents: Array.from(VALID_AGENTS)
        };
    }
}
