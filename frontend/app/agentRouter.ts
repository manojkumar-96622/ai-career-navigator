import { runCareerAgent } from "./careerRescueAgent";
import { runLegalAgent } from "./legalShieldAgent";
import { runFinanceAgent } from "./financeGuardAgent";
import { runHealthAgent } from "./healthNavigatorAgent";
import { runMindAgent } from "./mindSupportAgent";
import { runShieldAgent } from "./shieldModeAgent";

// Map string names to the actual instantiated functions
const AGENT_MAP: Record<string, Function> = {
    "CareerRescueAgent": runCareerAgent,
    "LegalShieldAgent": runLegalAgent,
    "FinanceGuardAgent": runFinanceAgent,
    "HealthNavigatorAgent": runHealthAgent,
    "MindSupportAgent": runMindAgent,
    "ShieldModeAgent": runShieldAgent
};

export type AgentResults = {
    careerHelp: any | null;
    legalHelp: any | null;
    financeHelp: any | null;
    healthHelp: any | null;
    mindSupport: any | null;
    shieldHelp: any | null;
};

export async function routeToAgents(
    activeAgents: string[],
    userMessage: string,
    emotionInstruction: string,
    emotionTag: string,
    onAgentStatusUpdate: (agentName: string, status: "WAITING" | "ANALYZING" | "WORKING" | "DONE" | "SKIPPED") => void
): Promise<AgentResults> {

    const results: AgentResults = {
        careerHelp: null,
        legalHelp: null,
        financeHelp: null,
        healthHelp: null,
        mindSupport: null,
        shieldHelp: null
    };

    // Mark agents that are not active as SKIPPED
    Object.keys(AGENT_MAP).forEach(agent => {
        if (!activeAgents.includes(agent)) {
            onAgentStatusUpdate(agent, "SKIPPED");
        }
    });

    // Helper to format the prompt specifically for sub-agents to include the emotion instruction
    const getPayload = () => `[SYSTEM OVERRIDE TONE: ${emotionInstruction}]\n\nUser Message: ${userMessage}`;

    // ---------------------------------------------------------
    // STRICT RULE: If DISTRESSED, MindSupportAgent must fire FIRST and finish before others start.
    // ---------------------------------------------------------
    if (emotionTag === "DISTRESSED" && activeAgents.includes("MindSupportAgent")) {
        onAgentStatusUpdate("MindSupportAgent", "WORKING");
        try {
            // We pass the raw userMessage to mindSupportAgent because its prompt is hardcoded differently
            results.mindSupport = await runMindAgent(userMessage);
            onAgentStatusUpdate("MindSupportAgent", "DONE");
        } catch (e) {
            console.error("MindSupportAgent sequential override failed", e);
            onAgentStatusUpdate("MindSupportAgent", "DONE"); // Mark done even if failed to continue flow
        }
    }

    // ---------------------------------------------------------
    // BATCH EXECUTION: Fire all remaining active agents in parallel
    // ---------------------------------------------------------
    const promises: Promise<{ name: string, data: any }>[] = [];

    activeAgents.forEach(agentName => {
        // Skip Mind Support if it already ran sequentially above
        if (emotionTag === "DISTRESSED" && agentName === "MindSupportAgent") return;

        const agentFn = AGENT_MAP[agentName];
        if (!agentFn) return;

        onAgentStatusUpdate(agentName, "WORKING");

        // Mind Support expects raw string, others can take the injected tone payload
        const payload = agentName === "MindSupportAgent" ? userMessage : getPayload();

        promises.push(
            agentFn(payload)
                .then((res: any) => {
                    onAgentStatusUpdate(agentName, "DONE");
                    return { name: agentName, data: res };
                })
                .catch((err: any) => {
                    console.error(`${agentName} parallel failure:`, err);
                    onAgentStatusUpdate(agentName, "DONE"); // Done even if it threw, so UI clears
                    return { name: agentName, data: null };
                })
        );
    });

    // Await all parallel execution simultaneously
    const settled = await Promise.allSettled(promises);

    // Map resolutions back into the results object
    settled.forEach(res => {
        if (res.status === "fulfilled") {
            const { name, data } = res.value;
            if (name === "CareerRescueAgent") results.careerHelp = data;
            if (name === "LegalShieldAgent") results.legalHelp = data;
            if (name === "FinanceGuardAgent") results.financeHelp = data;
            if (name === "HealthNavigatorAgent") results.healthHelp = data;
            if (name === "MindSupportAgent" && !results.mindSupport) results.mindSupport = data;
            if (name === "ShieldModeAgent") results.shieldHelp = data;
        }
    });

    return results;
}
