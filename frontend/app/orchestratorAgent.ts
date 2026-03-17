// frontend/app/orchestratorAgent.ts
import { analyzeCrisis, CrisisAnalysis } from "./crisisAnalyzer";
import { emotionRules } from "./emotionRules";
import { routeToAgents, AgentResults } from "./agentRouter";
import { compileReport, CrisisReport } from "./reportCompiler";

export async function runOrchestrator(
    userMessage: string,
    emotionTag: string,
    onOrchestratorPhase: (phase: "analyzing" | "running" | "done") => void,
    onAgentStatusUpdate: (agentName: string, status: "WAITING" | "ANALYZING" | "WORKING" | "DONE" | "SKIPPED") => void
): Promise<CrisisReport> {

    // STEP 1: INITIALIZE UI TO ANALYZING
    onOrchestratorPhase("analyzing");

    // Set all 5 potential agents to ANALYZING mode visually on the dashboard
    const allAgents = ["CareerRescueAgent", "LegalShieldAgent", "FinanceGuardAgent", "HealthNavigatorAgent", "MindSupportAgent"];
    allAgents.forEach(agent => onAgentStatusUpdate(agent, "ANALYZING"));

    // STEP 2: ANALYZE THE CRISIS
    // Calls Gemini to extract specific problems and determine exactly which subset of agents to fire
    let analysis: CrisisAnalysis;
    try {
        analysis = await analyzeCrisis(userMessage);
    } catch (e) {
        console.error("Orchestrator analysis failed, defaulting to all triggers.", e);
        analysis = {
            detectedProblems: ["Unable to explicitly parse problems. Routing to all available rescue modules."],
            activeAgents: allAgents
        };
    }

    const { detectedProblems, activeAgents } = analysis;

    // STEP 3: PREPARE EMOTION OVERRIDE
    // Looks up the specific tone constraint based on the emotion classifier
    const emotionInstruction = emotionRules[emotionTag] || "Respond carefully and thoroughly.";

    // Move UI phase from analyzing to running
    onOrchestratorPhase("running");

    // STEP 4: ROUTE TO AGENTS AND WAIT
    // Will execute Promise.all for speed, handling the DISTRESSED override internally
    const results: AgentResults = await routeToAgents(
        activeAgents,
        userMessage,
        emotionInstruction,
        emotionTag,
        onAgentStatusUpdate
    );

    // STEP 5: COMPILE REPORT
    // Take all outputs, wrap them in the final typed report, and return to the UI app
    const report = compileReport(results, emotionTag, detectedProblems, activeAgents);

    onOrchestratorPhase("done");
    return report;
}
