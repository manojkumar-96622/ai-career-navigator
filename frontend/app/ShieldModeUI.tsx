import React, { useState } from 'react';
import { ShieldRescueResult } from './shieldModeAgent';
import { extractJSON } from './shieldUtils'; // fallback parser if needed
import ReactMarkdown from "react-markdown";

type TabType = 'overview' | 'risk' | 'action';

interface ShieldModeUIProps {
    result: ShieldRescueResult;
    isComplete: boolean;
}

export default function ShieldModeUI({ result, isComplete }: ShieldModeUIProps) {
    const [activeTab, setActiveTab] = useState<TabType>('overview');

    const tabs: { id: TabType; label: string; icon: string }[] = [
        { id: 'overview', label: 'Threat Overview', icon: '🚨' },
        { id: 'risk', label: 'Risk Analysis', icon: '🔍' },
        { id: 'action', label: 'Mitigation Plan', icon: '🛡️' }
    ];

    const getThreatColor = (level: string | null) => {
        if (!level) return 'border-gray-500/30 text-gray-400 bg-gray-900/40';
        switch (level.toUpperCase()) {
            case 'CRITICAL': return 'border-red-600/60 text-red-500 bg-red-950/60 shadow-[0_0_20px_rgba(220,38,38,0.3)] animate-pulse';
            case 'HIGH': return 'border-orange-500/50 text-orange-400 bg-orange-950/50';
            case 'MEDIUM': return 'border-yellow-500/50 text-yellow-400 bg-yellow-900/30';
            case 'LOW':
            case 'SAFE':
                return 'border-emerald-500/50 text-emerald-400 bg-emerald-950/40';
            default: return 'border-gray-500/30 text-gray-400 bg-gray-900/40';
        }
    };

    const renderLoader = (text: string) => (
        <div className="flex flex-col items-center justify-center p-12 text-rose-400">
            <div className="w-10 h-10 border-4 border-rose-500/30 border-t-rose-500 rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(244,63,94,0.5)]"></div>
            <p className="text-sm font-medium animate-pulse tracking-wide">{text}</p>
        </div>
    );

    const renderError = (msg: string) => (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-6 text-red-300 text-sm shadow-inner flex items-start gap-3">
            <span className="text-xl">🛑</span>
            <div>
                <strong className="block text-red-400 mb-1 font-semibold tracking-wide">Analysis Failed</strong>
                {msg}
            </div>
        </div>
    );

    return (
        <div className="w-full max-w-5xl mx-auto bg-[#0a0a0a] border border-red-900/30 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative font-sans">
            
            {/* Header */}
            <div className="bg-gradient-to-r from-rose-950 to-black border-b border-rose-900/40 px-8 py-5 flex justify-between items-center relative overflow-hidden">
                <div className="relative z-10 flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose-500/10 border border-rose-500/20 shadow-inner">
                        <span className="text-xl">🛡️</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-wide text-white drop-shadow-sm">Shield Mode Intelligence</h2>
                        <p className="text-xs font-medium text-rose-400/70 mt-1 uppercase tracking-wider">Cybersecurity Threat Matrix</p>
                    </div>
                </div>
                {!isComplete && (
                    <div className="relative z-10 flex items-center gap-3 text-xs font-semibold tracking-widest uppercase text-rose-300 bg-rose-900/40 px-4 py-2 rounded-full border border-rose-500/30 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping"></span>
                        Scanning Systems...
                    </div>
                )}
            </div>

            {/* Tabs Nav */}
            <div className="flex border-b-2 border-gray-800 bg-black backdrop-blur-md px-4 pt-4 gap-2 overflow-x-auto custom-scrollbar relative">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-4 text-base font-bold rounded-t-xl transition-all duration-300 ease-out focus:outline-none whitespace-nowrap ${
                                isActive 
                                ? 'text-white bg-[#0a0a0a] border-t-2 border-l border-r border-t-rose-500 border-l-gray-800 border-r-gray-800 shadow-[0_-4px_15px_rgba(244,63,94,0.15)] z-10 relative'
                                : 'text-gray-400 hover:text-white hover:bg-gray-900/80 border-t border-l border-r border-transparent'
                            }`}
                        >
                            <span className={isActive ? 'opacity-100' : 'opacity-60'}>{tab.icon}</span>
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Content Area */}
            <div className="p-8 max-h-[700px] min-h-[300px] overflow-y-auto custom-scrollbar bg-[#050505]">
                
                {activeTab === 'overview' && (
                    <div className="animate-fade-in max-w-3xl mx-auto space-y-6">
                        {!result.threatLevel && !result.errors?.general && renderLoader("Extracting threat vectors and checking heuristics...")}
                        {result.errors?.general && renderError(result.errors.general)}

                        {result.threatLevel && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className={`p-6 bg-black rounded-2xl border ${getThreatColor(result.threatLevel)} flex flex-col items-center justify-center text-center`}>
                                    <span className="text-xs uppercase font-bold tracking-[0.2em] mb-2 opacity-80">Threat Level</span>
                                    <span className="text-4xl font-black">{result.threatLevel}</span>
                                </div>
                                <div className="p-6 bg-gray-900/50 rounded-2xl border border-gray-800 flex flex-col items-center justify-center text-center">
                                    <span className="text-xs uppercase font-bold tracking-[0.2em] text-gray-500 mb-2">Primary Category</span>
                                    <span className="text-2xl font-bold text-white">{result.category || "Unknown"}</span>
                                </div>
                            </div>
                        )}

                        {result.redFlags && result.redFlags.length > 0 && (
                            <div className="bg-gray-900/30 border border-gray-800 p-6 rounded-2xl">
                                <h3 className="text-sm font-bold text-rose-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                    <span>🚩</span> Detected Red Flags
                                </h3>
                                <ul className="space-y-3">
                                    {result.redFlags.map((flag, idx) => (
                                        <li key={idx} className="flex gap-3 text-sm text-gray-300 items-start">
                                            <span className="text-rose-500 mt-0.5">⚠️</span> 
                                            <span>{flag}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                        
                        {result.threatLevel === "SAFE" && (
                            <div className="p-6 bg-emerald-950/20 border border-emerald-900/50 rounded-2xl text-center">
                                <span className="text-4xl mb-4 block">✅</span>
                                <h3 className="text-lg font-bold text-emerald-400 mb-2">No Immediate Threats Detected</h3>
                                <p className="text-emerald-200/60 text-sm">However, always remain vigilant. Do not share personal information unless you fully trust the recipient.</p>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'risk' && (
                    <div className="animate-fade-in max-w-3xl mx-auto">
                        {!result.detailedRisk && !result.errors?.detailedRisk && renderLoader("Generating deep risk analysis...")}
                        {result.errors?.detailedRisk && renderError(result.errors.detailedRisk)}

                        {result.detailedRisk && (
                            <div className="prose prose-invert prose-rose max-w-none text-[15px] leading-relaxed text-gray-300">
                                <ReactMarkdown remarkPlugins={[]}>{result.detailedRisk}</ReactMarkdown>
                            </div>
                        )}
                    </div>
                )}

                {activeTab === 'action' && (
                    <div className="animate-fade-in max-w-3xl mx-auto">
                        {!result.safetyAction && !result.errors?.safetyAction && renderLoader("Compiling emergency mitigation steps...")}
                        {result.errors?.safetyAction && renderError(result.errors.safetyAction)}

                        {result.safetyAction && (
                            <div className="prose prose-invert prose-emerald max-w-none text-[15px] leading-relaxed text-gray-300">
                                <ReactMarkdown remarkPlugins={[]}>{result.safetyAction}</ReactMarkdown>
                            </div>
                        )}
                    </div>
                )}

            </div>
        </div>
    );
}
