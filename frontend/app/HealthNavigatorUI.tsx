"use client";

import React, { useState } from "react";
import { HealthRescueResult } from "./healthNavigatorAgent";
import { downloadLetterAsPDF, openGoogleMaps } from "./healthUtils";

type TabName = "hospitals" | "treatment" | "tests" | "letter";

export default function HealthNavigatorUI({ data }: { data: HealthRescueResult }) {
    const [activeTab, setActiveTab] = useState<TabName>("hospitals");

    const isLoading = data.loadingPhase !== "done";

    const TabButton = ({ name, label, icon }: { name: TabName; label: string; icon: string }) => (
        <button
            onClick={() => setActiveTab(name)}
            className={`flex-1 py-3 px-2 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2
        ${activeTab === name
                    ? "border-rose-500 text-rose-400 bg-rose-500/10"
                    : "border-transparent text-gray-400 hover:text-gray-200 hover:bg-white/5"
                }`}
        >
            <span>{icon}</span>
            <span className="hidden sm:inline">{label}</span>
        </button>
    );

    const renderError = (key: string) => {
        if (!data.errors[key]) return null;
        return (
            <div className="p-4 mb-4 bg-red-900/30 border border-red-500/50 rounded-lg text-red-400 text-sm">
                ⚠️ {data.errors[key]}
            </div>
        );
    };

    const renderHospitals = () => {
        if (isLoading && !data.nearestHospitals && data.loadingPhase === "hospitals") {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Locating nearest appropriate medical facilities...</div>;
        }

        if (!data.nearestHospitals || data.nearestHospitals.length === 0) {
            return (
                <div className="p-8 text-center text-gray-400">
                    Could not locate specific hospitals for your profile. Please search your local area for Government District Hospitals.
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {renderError("nearestHospitals")}
                {data.nearestHospitals.map((hospital, i) => {
                    let badgeClass = "bg-gray-700 text-gray-300";
                    if (hospital.hospitalType.includes("Government")) badgeClass = "bg-rose-900/40 text-rose-300 border border-rose-800";
                    if (hospital.hospitalType.includes("Ayushman")) badgeClass = "bg-blue-900/40 text-blue-300 border border-blue-800";

                    let costClass = "text-gray-400";
                    if (hospital.approximateCost.toLowerCase().includes("free")) costClass = "text-green-400 font-bold";
                    if (hospital.approximateCost.toLowerCase().includes("covered")) costClass = "text-blue-400 font-bold";
                    if (hospital.approximateCost.toLowerCase().includes("Rs") || hospital.approximateCost.toLowerCase().includes("INR")) costClass = "text-amber-400";

                    return (
                        <div key={i} className="bg-gray-800/50 border border-rose-500/20 rounded-xl p-5 shadow-lg relative overflow-hidden">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 gap-2">
                                <div>
                                    <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                                        🏥 {hospital.hospitalName}
                                    </h3>
                                    <div className={`mt-2 inline-block px-3 py-1 rounded-md text-xs font-bold ${badgeClass}`}>
                                        {hospital.hospitalType}
                                    </div>
                                </div>
                                <button
                                    onClick={() => openGoogleMaps(hospital.mapSearchTerm)}
                                    className="px-3 py-1.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-lg text-xs font-bold hover:bg-rose-500/30 transition-colors whitespace-nowrap"
                                >
                                    Find on Maps 🗺️
                                </button>
                            </div>

                            <div className="space-y-2 text-sm mt-4">
                                <p className="text-gray-300">
                                    <strong className="text-gray-500">Speciality:</strong> {hospital.speciality}
                                </p>
                                <p className="text-gray-300">
                                    <strong className="text-gray-500">Why recommended:</strong> {hospital.whyRecommended}
                                </p>
                                <p className="text-gray-300">
                                    <strong className="text-gray-500">Address:</strong> {hospital.address}
                                </p>
                                <p className="text-gray-300">
                                    <strong className="text-gray-500">How to reach:</strong> {hospital.howToReach}
                                </p>
                                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mt-3 pt-3 border-t border-gray-700/50">
                                    <span className={costClass}>Cost: {hospital.approximateCost}</span>
                                    {hospital.emergencyNumber && hospital.emergencyNumber.toLowerCase() !== "unknown" && (
                                        <span className="text-red-400 font-bold flex items-center gap-1 mt-2 sm:mt-0">
                                            📞 Emergency: {hospital.emergencyNumber}
                                        </span>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderTreatment = () => {
        if (isLoading && !data.schemeEligibility && data.loadingPhase === "schemes") {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Checking eligibility for free government treatment...</div>;
        }

        if (!data.schemeEligibility || data.schemeEligibility.length === 0) {
            return (
                <div className="p-8 text-center text-gray-400">
                    No matching government health schemes found for your specific profile at this time.
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {renderError("schemeEligibility")}
                {data.schemeEligibility.map((scheme, i) => {
                    let badgeClass = "bg-gray-700 text-gray-300 border-gray-600";
                    if (scheme.qualifies === "Yes") badgeClass = "bg-green-900/40 text-green-400 border-green-800";
                    if (scheme.qualifies === "Possibly") badgeClass = "bg-amber-900/40 text-amber-400 border-amber-800";

                    return (
                        <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-5 hover:border-blue-500/30 transition-colors">
                            <div className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 gap-2">
                                <h3 className="text-lg font-bold text-blue-400 flex items-center gap-2">
                                    🛡️ {scheme.schemeName}
                                </h3>
                                <div className={`px-3 py-1 rounded-full text-xs font-bold border ${badgeClass}`}>
                                    Eligibility: {scheme.qualifies}
                                </div>
                            </div>

                            <div className="mb-4 inline-block bg-blue-900/20 text-blue-200 px-3 py-1.5 rounded-md text-sm border border-blue-900/50 w-full sm:w-auto">
                                <strong>Coverage:</strong> {scheme.benefitAmount}
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm mt-2">
                                <div>
                                    <strong className="block text-gray-500 mb-1">How to verify:</strong>
                                    <p className="text-gray-300">{scheme.howToVerify}</p>

                                    <div className="mt-3">
                                        {scheme.officialLink && typeof scheme.officialLink === 'string' && scheme.officialLink.toLowerCase() !== "unknown" ? (
                                            <a
                                                href={scheme.officialLink.startsWith('http') ? scheme.officialLink : `https://${scheme.officialLink}`}
                                                target="_blank"
                                                rel="noreferrer"
                                                className="text-blue-400 hover:text-blue-300 underline text-xs break-all"
                                            >
                                                {scheme.officialLink}
                                            </a>
                                        ) : (
                                            <span className="text-gray-500 text-xs">No link available</span>
                                        )}
                                    </div>
                                </div>
                                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                                    <strong className="block text-gray-400 mb-2 text-xs uppercase tracking-wider">Required Documents</strong>
                                    <ul className="list-disc list-inside space-y-1 text-gray-300">
                                        {Array.isArray(scheme.documentsNeeded) ? scheme.documentsNeeded.map((doc, j) => (
                                            <li key={j}>{doc}</li>
                                        )) : (
                                            <li>{(scheme.documentsNeeded as any) || "Contact hospital for details"}</li>
                                        )}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    };

    const renderTests = () => {
        if (isLoading && !data.diagnosticCenters && data.loadingPhase === "diagnostics") {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Searching for free diagnostic centers...</div>;
        }

        if (!data.diagnosticCenters || data.diagnosticCenters.length === 0) {
            return (
                <div className="p-8 text-center text-gray-400">
                    No free diagnostic centers found. Please visit your nearest Government District Hospital.
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {renderError("diagnosticCenters")}
                <div className="bg-purple-900/10 border-l-4 border-purple-500 p-4 mb-6 rounded-r-lg">
                    <p className="text-purple-300 text-sm">
                        Pro Tip: Government District Hospitals perform essential laboratory tests, X-Rays, and ECGs entirely free of charge for citizens.
                    </p>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {data.diagnosticCenters.map((center, i) => (
                        <div key={i} className="bg-gray-800 border border-gray-700 rounded-xl p-5 flex flex-col h-full">
                            <h3 className="text-lg font-bold text-gray-100 flex items-center gap-2 mb-2">
                                🔬 {center.centerType}
                            </h3>
                            <p className="text-xs text-gray-400 mb-4">{center.whoQualifies}</p>

                            <div className="flex-grow">
                                <strong className="block text-gray-500 text-xs uppercase tracking-wider mb-2">Free Services</strong>
                                <ul className="space-y-1 text-sm text-gray-300 mb-4">
                                    {Array.isArray(center.freeServices) ? center.freeServices.map((service, j) => (
                                        <li key={j} className="flex items-start gap-2">
                                            <span className="text-purple-500 mt-0.5">•</span>
                                            <span>{service}</span>
                                        </li>
                                    )) : (
                                        <li className="flex items-start gap-2">
                                            <span className="text-purple-500 mt-0.5">•</span>
                                            <span>{(center.freeServices as any) || "Standard tests available"}</span>
                                        </li>
                                    )}
                                </ul>
                            </div>

                            <div className="mt-auto pt-4 border-t border-gray-700/50">
                                <p className="text-xs text-gray-400 mb-3 flex items-center gap-1">
                                    <span className="text-gray-500">⏱️</span> {center.timings}
                                </p>
                                <button
                                    onClick={() => openGoogleMaps(center.howToFind)}
                                    className="w-full py-2 bg-gray-700 hover:bg-gray-600 text-gray-200 border border-gray-600 rounded-lg text-sm font-medium transition-colors"
                                >
                                    Search Maps Near Me
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    const renderLetter = () => {
        if (isLoading && !data.leaveLetters && data.loadingPhase === "letter") {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Drafting medical leave application...</div>;
        }

        if (!data.leaveLetters) {
            return (
                <div className="p-8 text-center text-gray-400">
                    Could not draft the leave letter from the provided information.
                </div>
            );
        }

        const letters = data.leaveLetters;

        // Function to highlight [PLACEHOLDERS]
        const renderWithHighlights = (text: string) => {
            return text.split(/(\[.*?\])/).map((part, i) => {
                if (part.startsWith('[') && part.endsWith(']')) {
                    return <span key={i} className="bg-yellow-200/90 text-yellow-900 px-1 rounded mx-0.5 font-bold">{part}</span>;
                }
                return part;
            });
        };

        const copyToClipboard = (text: string) => {
            navigator.clipboard.writeText(text);
            alert("Copied directly to clipboard!");
        }

        return (
            <div className="space-y-6">
                {renderError("leaveLetters")}

                <div className="bg-gray-200 rounded-xl overflow-hidden border border-gray-300 shadow-inner">
                    <div className="bg-gray-300 px-4 py-3 border-b border-gray-400 flex justify-between items-center text-gray-800">
                        <span className="font-bold font-sans flex items-center gap-2">
                            📄 Formal Application
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => copyToClipboard(letters.formalLetter)}
                                className="bg-white hover:bg-gray-100 text-gray-700 px-3 py-1 rounded shadow-sm text-xs font-medium transition-colors"
                            >
                                Copy Text
                            </button>
                            <button
                                onClick={() => downloadLetterAsPDF(letters.formalLetter)}
                                className="bg-rose-600 hover:bg-rose-700 text-white px-3 py-1 rounded shadow-sm text-xs font-medium transition-colors"
                            >
                                PDF
                            </button>
                        </div>
                    </div>
                    <div className="p-6 md:p-8 bg-white text-gray-900 whitespace-pre-wrap font-serif text-sm leading-relaxed" id="health-letter">
                        {renderWithHighlights(letters.formalLetter)}
                    </div>
                </div>

                <div className="bg-[#111B21] rounded-xl overflow-hidden border border-[#202C33]">
                    <div className="bg-[#202C33] px-4 py-3 flex justify-between items-center text-gray-200">
                        <span className="font-bold flex items-center gap-2">
                            <span className="text-[#00A884]">💬</span> WhatsApp Quick Message
                        </span>
                        <button
                            onClick={() => copyToClipboard(letters.whatsappVersion)}
                            className="bg-[#00A884] hover:bg-[#029072] text-white px-3 py-1 rounded text-xs font-bold transition-colors"
                        >
                            Copy to Chat
                        </button>
                    </div>
                    <div className="p-4 bg-[url('https://web.whatsapp.com/img/bg-chat-tile-dark_a4be512e7195b6b733d9110b408f075d.png')] bg-repeat opacity-90">
                        <div className="bg-[#005C4B] text-[#E9EDEF] p-3 rounded-lg rounded-tl-none max-w-[85%] whitespace-pre-wrap text-sm shadow inline-block">
                            {renderWithHighlights(letters.whatsappVersion)}
                            <div className="text-[10px] text-[#8696A0] text-right mt-1">Just now</div>
                        </div>
                    </div>
                </div>

            </div>
        );
    };

    return (
        <div className="w-full max-w-4xl mx-auto bg-[#0A0A0A] border border-gray-800 rounded-xl shadow-2xl overflow-hidden font-sans my-4 z-10 relative">
            {/* Disclaimer Bar */}
            <div className="bg-rose-900/30 border-b border-rose-500/20 px-4 py-2 text-xs text-rose-300 text-center font-medium">
                ⚠️ Health Navigator is an AI assistant, not a doctor. In a severe medical emergency, call 108 or your local emergency number instantly.
            </div>

            {/* Header Tabs */}
            <div className="flex border-b border-gray-800 bg-[#111]">
                <TabButton name="hospitals" label="Hospitals" icon="🏥" />
                <TabButton name="treatment" label="Treatment" icon="🛡️" />
                <TabButton name="tests" label="Free Tests" icon="🔬" />
                <TabButton name="letter" label="Leave Letter" icon="📝" />
            </div>

            {/* Content Area */}
            <div className="p-4 sm:p-6 min-h-[400px]">
                {/* Global Error */}
                {renderError("general")}

                {/* Tab Content */}
                {activeTab === "hospitals" && renderHospitals()}
                {activeTab === "treatment" && renderTreatment()}
                {activeTab === "tests" && renderTests()}
                {activeTab === "letter" && renderLetter()}
            </div>
        </div>
    );
}
