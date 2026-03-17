// frontend/app/MindSupportUI.tsx
import React, { useState, useEffect } from "react";
import { mindSupportResult } from "./mindSupportAgent";

export function MindSupportUI({
    data,
    isLoading
}: {
    data: mindSupportResult | null;
    isLoading: boolean;
}) {
    const [activeTab, setActiveTab] = useState<string>("support");
    const [exerciseStep, setExerciseStep] = useState<number>(-1);
    const [selectedTime, setSelectedTime] = useState<string>("");

    // Reset states when data changes
    useEffect(() => {
        if (data) {
            setExerciseStep(-1);
            if (data.checkInReminder?.defaultTime) {
                setSelectedTime(data.checkInReminder.defaultTime);
            }
            // Enforce Safe Strict Rules - Hide tabs if SEVERE
            if (data.requiresImmediateHelp) {
                setActiveTab("support");
            }
        }
    }, [data]);

    if (!data) return null;

    const isSevere = data.requiresImmediateHelp;

    const getBorderColor = () => {
        switch (data.crisisLevel) {
            case "SEVERE": return "border-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]";
            case "HIGH": return "border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)]";
            case "MODERATE": return "border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.2)]";
            case "LOW": return "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.2)]";
            default: return "border-gray-700";
        }
    };

    const tabs = [
        { id: "support", label: "💬 Support", show: true },
        { id: "helplines", label: "📞 Helplines", show: true },
        { id: "calm", label: "🧘‍♀️ Calm Exercise", show: !isSevere },
        { id: "checkin", label: "⏰ Daily Check-in", show: !isSevere }
    ];

    const renderError = (key: string) => {
        if (data.errors && data.errors[key]) {
            return (
                <div className="bg-red-900/20 border border-red-500/50 text-red-400 p-4 rounded-lg text-sm mb-4">
                    ⚠️ {data.errors[key]}
                </div>
            );
        }
        return null;
    };

    const renderSeverityBadge = () => {
        const _level = data.crisisLevel || "ANALYZING";
        const colors: Record<string, string> = {
            "SEVERE": "bg-red-600 border-red-400 text-white animate-pulse",
            "HIGH": "bg-amber-600 border-amber-400 text-white",
            "MODERATE": "bg-purple-600 border-purple-400 text-white",
            "LOW": "bg-blue-600 border-blue-400 text-white",
            "ANALYZING": "bg-gray-600 border-gray-400 text-white"
        };
        return (
            <span className={`text-xs px-2 py-0.5 rounded-full border ${colors[_level] || colors["ANALYZING"]} font-bold`}>
                {_level}
            </span>
        );
    };

    // Sub-renderers
    const renderSupportTab = () => {
        if (isLoading && !data.supportiveResponse) {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Reading and understanding...</div>;
        }

        return (
            <div className="space-y-4">
                {renderError("supportiveResponse")}

                {/* STRICT RULE: Show helplines ABOVE the message if SEVERE */}
                {isSevere && data.helplines && (
                    <div className="mb-6 space-y-3 p-4 bg-red-900/20 border border-red-500/50 rounded-xl">
                        <h3 className="text-red-400 font-bold uppercase tracking-wider text-sm mb-2 flex items-center gap-2">
                            🚨 Immediate Crisis Helplines
                        </h3>
                        {data.helplines.map((h, i) => (
                            <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between bg-gray-900/50 p-3 rounded-lg border border-red-900">
                                <div>
                                    <strong className="text-gray-100">{h.name}</strong>
                                    <p className="text-xs text-gray-400">{h.hours}</p>
                                </div>
                                <a href={`tel:${h.number}`} className="mt-2 sm:mt-0 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg text-sm text-center transition-colors">
                                    Call {h.number}
                                </a>
                            </div>
                        ))}
                    </div>
                )}

                <div className="bg-gray-900/60 p-6 rounded-xl border border-gray-800">
                    <p className="text-lg text-gray-200 leading-relaxed whitespace-pre-wrap">
                        {data.supportiveResponse}
                    </p>

                    {data.emotionalAssessment?.detectedEmotions && (
                        <div className="mt-6 pt-4 border-t border-gray-800 flex flex-wrap gap-2">
                            {data.emotionalAssessment.detectedEmotions.map((em: string, i: number) => (
                                <span key={i} className="px-2 py-1 bg-gray-800 text-gray-400 text-xs rounded-md">
                                    {em}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderHelplinesTab = () => {
        if (!data.helplines) return <p>Loading resources...</p>;

        return (
            <div className="space-y-4">
                {renderError("helplines")}
                {data.helplines.map((h: any, i: number) => (
                    <div key={i} className={`bg-gray-900 rounded-xl p-5 border ${i === 0 ? "border-amber-500/50" : "border-gray-800"}`}>
                        {i === 0 && (
                            <span className="inline-block text-[10px] font-bold uppercase tracking-widest text-amber-500 bg-amber-500/10 px-2 py-1 rounded mb-3">
                                Recommended
                            </span>
                        )}
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                            <div>
                                <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                                    📞 {h.name}
                                </h3>
                                <p className="text-xl font-mono text-gray-300 my-1">{h.number}</p>
                                <p className="text-xs text-gray-500">{h.hours}</p>
                                <p className="text-sm text-gray-300 mt-3">{h.about}</p>
                                <p className="text-xs text-gray-400 italic mt-1">{h.bestFor}</p>
                                {h.website && (
                                    <a href={h.website} target="_blank" rel="noreferrer" className="text-blue-400 hover:text-blue-300 underline text-xs mt-3 inline-block">
                                        Visit Website
                                    </a>
                                )}
                            </div>
                            <div className="flex-shrink-0 w-full md:w-auto mt-4 md:mt-0">
                                <a
                                    href={`tel:${h.number}`}
                                    className="block w-full text-center px-8 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-lg transition-colors border border-gray-600"
                                >
                                    Call Now
                                </a>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderCalmTab = () => {
        if (isSevere) {
            return (
                <div className="p-8 text-center bg-red-900/20 border border-red-500/50 rounded-xl">
                    <p className="text-red-400 font-bold mb-2">Please call a helpline first.</p>
                    <p className="text-gray-300 text-sm">An expert is ready to help you right now. Go to the Helplines tab.</p>
                </div>
            );
        }

        if (isLoading && !data.exercise) {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Finding a calming exercise...</div>;
        }

        if (!data.exercise) return null;

        const ex = data.exercise;

        return (
            <div className="space-y-6">
                <div className="text-center py-6">
                    <h2 className="text-2xl font-bold text-gray-100 mb-2">{ex.exerciseName}</h2>
                    <p className="text-gray-400 text-sm bg-gray-900 inline-block px-4 py-1 rounded-full border border-gray-800">
                        ⏱️ Takes about {ex.duration} minutes
                    </p>
                </div>

                <div className="bg-blue-900/10 border-l-4 border-blue-500 p-4 rounded-r-lg">
                    <p className="text-blue-300 text-sm font-medium">Why it helps:</p>
                    <p className="text-gray-300 text-sm mt-1">{ex.whyItHelps}</p>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <div className="space-y-4 relative">
                        {ex.steps.map((step: string, i: number) => {
                            const isActive = i === exerciseStep;
                            const isPassed = i < exerciseStep;
                            return (
                                <div key={i} className={`p-4 rounded-lg flex items-center gap-4 transition-all duration-500 ${isActive ? "bg-gray-800 border border-gray-600 shadow-md scale-105" :
                                        isPassed ? "opacity-50" : "opacity-30"
                                    }`}>
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isActive ? "bg-blue-500 text-white" : "bg-gray-700 text-gray-400"
                                        }`}>
                                        {i + 1}
                                    </div>
                                    <p className={`text-sm md:text-base ${isActive ? "text-gray-100 font-medium" : "text-gray-400"}`}>{step}</p>
                                </div>
                            );
                        })}
                    </div>

                    <div className="mt-8 flex justify-center">
                        <button
                            onClick={() => {
                                if (exerciseStep >= ex.steps.length - 1) {
                                    setExerciseStep(-1); // Reset
                                } else {
                                    setExerciseStep(prev => prev + 1);
                                }
                            }}
                            className={`px-8 py-3 rounded-lg font-bold text-sm transition-colors ${exerciseStep === -1
                                    ? "bg-blue-600 hover:bg-blue-500 text-white"
                                    : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                                }`}
                        >
                            {exerciseStep === -1 ? "Start Exercise"
                                : exerciseStep >= ex.steps.length - 1 ? "Finish & Reset"
                                    : "Next Step"}
                        </button>
                    </div>
                </div>
            </div>
        );
    };

    const renderCheckinTab = () => {
        if (isSevere) return null;

        if (isLoading && !data.checkInReminder) {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Setting up check-in assistant...</div>;
        }

        if (!data.checkInReminder) return <p className="text-gray-400 text-sm">Check-in system unavailable.</p>;

        const reminder = data.checkInReminder;

        return (
            <div className="space-y-6">
                {renderError("checkInReminder")}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-gray-100 mb-2">1. Choose your time</h3>
                    <p className="text-sm text-gray-400 mb-4">{reminder.reminderDescription}</p>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {reminder.timeOptions.map((time: string) => (
                            <button
                                key={time}
                                onClick={() => setSelectedTime(time)}
                                className={`py-2 px-3 rounded-lg text-sm font-medium transition-colors border ${selectedTime === time
                                        ? "bg-green-600/20 border-green-500 text-green-400"
                                        : "bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700"
                                    }`}
                            >
                                {time}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-lg font-bold text-gray-100 mb-2">2. Enable WhatsApp Bot</h3>
                    <p className="text-sm text-gray-400 mb-6">Click below to send the activation message from your phone.</p>

                    <div className="flex justify-center mb-4">
                        <a
                            href={reminder.whatsappOptInLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 px-6 py-3 bg-[#25D366] hover:bg-[#128C7E] text-white font-bold rounded-lg shadow-lg transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 16 16">
                                <path d="M13.601 2.326A7.854 7.854 0 0 0 7.994 0C3.627 0 .068 3.558.064 7.926c0 1.399.366 2.76 1.057 3.965L0 16l4.204-1.102a7.933 7.933 0 0 0 3.79.965h.004c4.368 0 7.926-3.558 7.93-7.93A7.898 7.898 0 0 0 13.6 2.326zM7.994 14.521a6.573 6.573 0 0 1-3.356-.92l-.24-.144-2.494.654.666-2.433-.156-.251a6.56 6.56 0 0 1-1.007-3.505c0-3.626 2.957-6.584 6.591-6.584a6.56 6.56 0 0 1 4.66 1.931 6.557 6.557 0 0 1 1.928 4.66c-.004 3.639-2.961 6.592-6.592 6.592zm3.615-4.934c-.197-.099-1.17-.578-1.353-.646-.182-.065-.315-.099-.445.099-.133.197-.513.646-.627.775-.114.133-.232.148-.43.05-.197-.1-.836-.308-1.592-.985-.59-.525-.985-1.175-1.103-1.372-.114-.198-.011-.304.088-.403.087-.088.197-.232.296-.346.1-.114.133-.198.198-.33.065-.134.034-.248-.015-.347-.05-.099-.445-1.076-.612-1.47-.16-.389-.323-.335-.445-.34-.114-.007-.247-.007-.38-.007a.729.729 0 0 0-.529.247c-.182.198-.691.677-.691 1.654 0 .977.71 1.916.81 2.049.098.133 1.394 2.132 3.383 2.992.47.205.84.326 1.129.418.475.152.904.129 1.246.08.38-.058 1.171-.48 1.338-.943.164-.464.164-.86.114-.943-.049-.084-.182-.133-.38-.232z" />
                            </svg>
                            Activate Reminders
                        </a>
                    </div>
                </div>

                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-sm font-bold text-gray-400 mb-4 uppercase tracking-wider">7-Day Message Preview</h3>
                    <div className="space-y-3 h-64 overflow-y-auto pr-2 custom-scrollbar">
                        {reminder.dailyMessages.map((msg: string, i: number) => (
                            <div key={i} className="bg-gray-800 p-3 rounded-lg border border-gray-700">
                                <span className="text-xs text-green-500 font-bold mb-1 block">Day {i + 1} • {selectedTime}</span>
                                <p className="text-gray-300 text-sm">{msg}</p>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    return (
        <div className={`w-full max-w-4xl mx-auto rounded-xl overflow-hidden bg-gray-[#0f1115] shadow-2xl border transition-all duration-300 ${getBorderColor()}`}>
            {/* Header */}
            <div className="bg-gray-900/80 p-6 border-b border-gray-800 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500 to-blue-600 flex items-center justify-center shadow-lg text-lg">
                        🧠
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-100">Mind Support Agent</h2>
                        <p className="text-sm text-gray-400">Compassionate support & resources</p>
                    </div>
                </div>
                {renderSeverityBadge()}
            </div>

            {/* Navigation Tabs */}
            <div className="flex border-b border-gray-800 overflow-x-auto bg-gray-900/30 hide-scrollbar">
                {tabs.filter(t => t.show).map((tab) => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-6 py-4 text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id
                                ? "text-blue-400 border-b-2 border-blue-400 bg-blue-900/10"
                                : "text-gray-400 hover:text-gray-200 hover:bg-gray-800/50"
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content Area */}
            <div className="p-6 bg-[#16181d] min-h-[400px]">
                {activeTab === "support" && renderSupportTab()}
                {activeTab === "helplines" && renderHelplinesTab()}
                {activeTab === "calm" && renderCalmTab()}
                {activeTab === "checkin" && renderCheckinTab()}
            </div>
        </div>
    );
}
