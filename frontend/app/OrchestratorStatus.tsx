// frontend/app/OrchestratorStatus.tsx
import React from 'react';

type AgentStatus = "WAITING" | "ANALYZING" | "WORKING" | "DONE" | "SKIPPED";
type OrchestratorPhase = "idle" | "analyzing" | "running" | "done" | "error";

interface OrchestratorStatusProps {
    phase: OrchestratorPhase;
    emotion: string;
    problemsFound: number;
    agentsFired: number;
    statusMap: Record<string, AgentStatus>;
}

const AGENT_META: Record<string, { name: string; icon: string }> = {
    "CareerRescueAgent": { name: "Career Rescue", icon: "💼" },
    "LegalShieldAgent": { name: "Legal Shield", icon: "⚖️" },
    "FinanceGuardAgent": { name: "Finance Guard", icon: "💰" },
    "HealthNavigatorAgent": { name: "Health Navigator", icon: "🏥" },
    "MindSupportAgent": { name: "Mind Support", icon: "🧠" },
    "ShieldModeAgent": { name: "Shield Mode", icon: "🛡️" }
};

export function OrchestratorStatus({
    phase,
    emotion,
    problemsFound,
    agentsFired,
    statusMap
}: OrchestratorStatusProps) {

    if (phase === "idle") return null;

    const renderBadge = (status: AgentStatus) => {
        switch (status) {
            case "WAITING":
                return <span className="text-xs font-bold px-3 py-1 bg-gray-800 text-gray-500 rounded-full border border-gray-700">WAITING</span>;
            case "ANALYZING":
                return (
                    <span className="text-xs font-bold px-3 py-1 bg-blue-900/40 text-blue-400 rounded-full border border-blue-500/50 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-spin" style={{ animationDuration: '0.6s' }}></span>
                        ANALYZING
                    </span>
                );
            case "WORKING":
                return (
                    <span className="text-xs font-bold px-3 py-1 bg-amber-900/40 text-amber-500 rounded-full border border-amber-500/50 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" style={{ animationDuration: '0.8s' }}></span>
                        WORKING
                    </span>
                );
            case "DONE":
                return (
                    <span className="text-xs font-bold px-3 py-1 bg-green-900/40 text-green-400 rounded-full border border-green-500/50 flex items-center gap-1">
                        ✓ DONE
                    </span>
                );
            case "SKIPPED":
                return (
                    <span className="text-xs font-bold px-3 py-1 bg-gray-900 text-gray-600 rounded-full border border-gray-800 flex items-center gap-1">
                        - SKIPPED
                    </span>
                );
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto my-8 bg-[#0f1115] rounded-xl border border-gray-800 shadow-2xl overflow-hidden">

            {/* Header / Summary Bar */}
            <div className="bg-gradient-to-r from-gray-900 to-indigo-900/20 p-6 border-b border-gray-800">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-cyan-400 tracking-tight flex items-center gap-2">
                            <span className="text-2xl pt-1">⚡</span> ATLAS MASTER ORCHESTRATOR
                        </h2>
                        <p className="text-sm text-gray-400 mt-1">Parallel Crisis Resolution Engine</p>
                    </div>

                    <div className="flex items-center gap-4 bg-gray-950/50 p-2 rounded-lg border border-gray-800/50">
                        <div className="text-center px-4 border-r border-gray-800">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Emotion</p>
                            <p className="text-sm font-mono text-indigo-300">{emotion || "DETECTING..."}</p>
                        </div>
                        <div className="text-center px-4 border-r border-gray-800">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Problems</p>
                            <p className="text-sm font-mono text-rose-300">{problemsFound}</p>
                        </div>
                        <div className="text-center px-4">
                            <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Agents Fired</p>
                            <p className="text-sm font-mono text-cyan-300">{agentsFired} / 6</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Agent Status Cards Grid */}
            <div className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                    {Object.entries(AGENT_META).map(([agentKey, meta]) => {
                        const status = statusMap[agentKey] || "WAITING";
                        return (
                            <div
                                key={agentKey}
                                className={`bg-gray-900/50 border rounded-xl p-4 flex flex-col items-center justify-center text-center transition-all duration-500 ${status === "WORKING" ? "border-amber-500/50 shadow-[0_0_15px_rgba(245,158,11,0.1)] scale-105" :
                                    status === "DONE" ? "border-green-500/30" :
                                        status === "ANALYZING" ? "border-blue-500/50" :
                                            "border-gray-800 opacity-60"
                                    }`}
                            >
                                <div className="text-3xl mb-3">{meta.icon}</div>
                                <h3 className="text-sm font-bold text-gray-200 mb-4">{meta.name}</h3>
                                {renderBadge(status)}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Phase Indicator Footer */}
            <div className="bg-gray-950 p-3 flex justify-center border-t border-gray-800">
                <div className="flex items-center gap-2 text-xs font-mono text-gray-500">
                    <span className={`w-2 h-2 rounded-full ${phase === 'running' ? 'bg-amber-500 animate-pulse' : phase === 'analyzing' ? 'bg-blue-500 animate-spin' : phase === 'done' ? 'bg-green-500' : 'bg-gray-600'}`}></span>
                    SYSTEM STATE: {phase.toUpperCase()}
                </div>
            </div>
        </div>
    );
}
