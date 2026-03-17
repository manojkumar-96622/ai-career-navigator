"use client";

import React, { useState } from "react";
import { FinanceRescueResult } from "./financeGuardAgent";
import { formatCurrency, downloadLetterAsPDF } from "./financeUtils";

type TabName = "schemes" | "budget" | "emi" | "apply";

export default function FinanceGuardUI({ data }: { data: FinanceRescueResult }) {
    const [activeTab, setActiveTab] = useState<TabName>("schemes");

    const isLoading = data.loadingPhase !== "done";

    const TabButton = ({ name, label, icon }: { name: TabName; label: string; icon: string }) => (
        <button
            onClick={() => setActiveTab(name)}
            className={`flex-1 py-3 px-2 text-sm font-medium transition-colors border-b-2 flex items-center justify-center gap-2
        ${activeTab === name
                    ? "border-emerald-500 text-emerald-400 bg-emerald-500/10"
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

    const renderSchemes = () => {
        if (isLoading && !data.qualifiedSchemes) {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Scanning government databases...</div>;
        }

        if (!data.qualifiedSchemes || data.qualifiedSchemes.length === 0) {
            return (
                <div className="p-8 text-center text-gray-400">
                    No matching government schemes found for your specific profile at this time.
                </div>
            );
        }

        return (
            <div className="space-y-4">
                {renderError("schemes")}
                {data.qualifiedSchemes.map((scheme, i) => (
                    <div key={i} className="bg-gray-800/50 border border-emerald-500/20 rounded-xl p-5 shadow-lg">
                        <div className="flex items-start justify-between mb-3">
                            <h3 className="text-xl font-bold text-gray-100 flex items-center gap-2">
                                💰 {scheme.schemeName}
                            </h3>
                            <a
                                href={scheme.applicationLink}
                                target="_blank"
                                rel="noreferrer"
                                className="px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded-full text-xs font-bold hover:bg-emerald-500/30 transition-colors"
                            >
                                Apply Now ↗
                            </a>
                        </div>
                        <div className="mb-4 inline-block bg-emerald-900/40 text-emerald-200 px-3 py-1 rounded-md text-sm border border-emerald-800">
                            <strong>Benefit:</strong> {scheme.benefit}
                        </div>
                        <p className="text-gray-300 text-sm mb-3">
                            <strong className="text-gray-400">Eligibility Met:</strong> {scheme.exactEligibility}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm text-gray-400 mb-2">
                            <div>
                                <strong className="block text-gray-500 mb-1">Documents Needed:</strong>
                                <ul className="list-disc list-inside space-y-1">
                                    {scheme.documentsNeeded.map((doc, j) => (
                                        <li key={j}>{doc}</li>
                                    ))}
                                </ul>
                            </div>
                            <div>
                                <strong className="block text-gray-500 mb-1">Details:</strong>
                                <p>📍 {scheme.whereToApply}</p>
                                <p>⏱️ {scheme.timeToBenefit}</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    const renderBudget = () => {
        if (isLoading && !data.survivalBudget) {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Calculating 30-day survival budget...</div>;
        }

        if (!data.survivalBudget) return null;

        const budget = data.survivalBudget;
        const statusColors = {
            Safe: "bg-emerald-500/20 text-emerald-400 border-emerald-500/50",
            Tight: "bg-amber-500/20 text-amber-400 border-amber-500/50",
            Critical: "bg-red-500/20 text-red-400 border-red-500/50"
        };

        return (
            <div className="space-y-6">
                {renderError("budget")}

                <div className="flex justify-between items-center p-4 bg-gray-800 rounded-xl border border-gray-700">
                    <div>
                        <div className="text-gray-400 text-sm font-medium">30-Day Survival Status</div>
                        <div className="text-gray-500 text-xs mt-1">Based on provided profile</div>
                    </div>
                    <div className={`px-4 py-2 rounded-lg border font-bold text-lg tracking-wide ${statusColors[budget.summary.survivalStatus]}`}>
                        {budget.summary.survivalStatus.toUpperCase()}
                    </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Income Card */}
                    <div className="bg-gray-800/50 rounded-xl p-5 border border-emerald-500/20">
                        <h4 className="text-emerald-400 font-bold mb-4 flex items-center gap-2">
                            <span>📥</span> Available Funds
                        </h4>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between text-gray-300">
                                <span>Current Income</span>
                                <span>{formatCurrency(budget.incomeThisMonth.currentIncome)}</span>
                            </div>
                            <div className="flex justify-between text-gray-300">
                                <span>Emergency Reserves</span>
                                <span>{formatCurrency(budget.incomeThisMonth.emergencyFund)}</span>
                            </div>
                            {budget.incomeThisMonth.expectedSchemeBenefit > 0 && (
                                <div className="flex justify-between text-emerald-400/80">
                                    <span>Expected Scheme Benefit</span>
                                    <span>+{formatCurrency(budget.incomeThisMonth.expectedSchemeBenefit)}</span>
                                </div>
                            )}
                            <div className="pt-3 mt-3 border-t border-gray-700 flex justify-between font-bold text-emerald-400">
                                <span>Total Available</span>
                                <span>{formatCurrency(budget.summary.totalAvailable)}</span>
                            </div>
                        </div>
                    </div>

                    {/* Expenses Card */}
                    <div className="bg-gray-800/50 rounded-xl p-5 border border-amber-500/20">
                        <h4 className="text-amber-400 font-bold mb-4 flex items-center gap-2">
                            <span>📤</span> Essential Expenses (Do Not Cut)
                        </h4>
                        <div className="space-y-3 text-sm">
                            <div className="flex justify-between text-gray-300">
                                <span>Food & Groceries</span>
                                <span>{formatCurrency(budget.essentialExpenses.foodAndGroceries)}</span>
                            </div>
                            <div className="flex justify-between text-gray-300">
                                <span>Rent / Housing</span>
                                <span>{formatCurrency(budget.essentialExpenses.rentOrHousing)}</span>
                            </div>
                            <div className="flex justify-between text-gray-300">
                                <span>Utilities (Elec/Water)</span>
                                <span>{formatCurrency(budget.essentialExpenses.utilities)}</span>
                            </div>
                            {(budget.essentialExpenses.schoolFees > 0) && (
                                <div className="flex justify-between text-gray-300">
                                    <span>School Fees</span>
                                    <span>{formatCurrency(budget.essentialExpenses.schoolFees)}</span>
                                </div>
                            )}
                            {(budget.essentialExpenses.medicines > 0) && (
                                <div className="flex justify-between text-gray-300">
                                    <span>Medicines</span>
                                    <span>{formatCurrency(budget.essentialExpenses.medicines)}</span>
                                </div>
                            )}
                            {(budget.essentialExpenses.minimumEMI > 0) && (
                                <div className="flex justify-between text-red-300/80">
                                    <span>Minimum EMI</span>
                                    <span>{formatCurrency(budget.essentialExpenses.minimumEMI)}</span>
                                </div>
                            )}
                            <div className="pt-3 mt-3 border-t border-gray-700 flex justify-between font-bold text-amber-400">
                                <span>Total Essential</span>
                                <span>{formatCurrency(budget.summary.totalEssential)}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-700 mt-4">
                    <h4 className="text-blue-400 font-bold mb-4 flex items-center gap-2">
                        <span>💡</span> Immediate Action: Money Saving Tips
                    </h4>
                    <ul className="space-y-3">
                        {budget.moneySavingTips.map((tip, i) => (
                            <li key={i} className="flex gap-3 text-sm text-gray-300">
                                <span className="text-blue-500 font-bold">{i + 1}.</span>
                                <span>{tip}</span>
                            </li>
                        ))}
                    </ul>
                </div>

                {budget.nonEssentialExpensesToCut && budget.nonEssentialExpensesToCut.length > 0 && (
                    <div className="bg-red-900/10 rounded-xl p-5 border border-red-500/20 mt-4">
                        <h4 className="text-red-400 font-bold mb-3">✂️ Top Expenses to Cut Immediately</h4>
                        <div className="space-y-2">
                            {budget.nonEssentialExpensesToCut.map((item, i) => (
                                <div key={i} className="flex justify-between text-sm text-gray-400">
                                    <span>{item.item}</span>
                                    <span className="text-red-400/80 font-mono">Save {formatCurrency(item.estimatedSavings)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const renderEmi = () => {
        if (isLoading && !data.emiPlan && data.loadingPhase === "emi") {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Drafting bank negotiation script...</div>;
        }

        if (!data.emiPlan) {
            return (
                <div className="p-8 text-center text-gray-400">
                    No existing loans were detected in your profile.
                </div>
            );
        }

        const emi = data.emiPlan;

        return (
            <div className="space-y-6">
                {renderError("emi")}

                <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-5">
                    <h3 className="text-lg font-bold text-blue-400 mb-2">Step 1: RBI Moratorium Guidelines</h3>
                    <p className="text-gray-300 text-sm">{emi.step1Moratorium}</p>
                </div>

                <div className="bg-purple-900/20 border border-purple-500/30 rounded-xl p-5">
                    <h3 className="text-lg font-bold text-purple-400 mb-2">Step 2: Loan Restructuring</h3>
                    <p className="text-gray-300 text-sm">{emi.step2Restructuring}</p>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-emerald-500/30">
                    <h3 className="text-lg font-bold text-emerald-400 mb-4">Step 3: Bank Visit Script</h3>
                    <div className="p-4 bg-gray-900 rounded-lg font-serif text-gray-300 italic mb-4">
                        "{emi.step3BankVisitScript}"
                    </div>
                </div>

                <div className="bg-gray-800 rounded-xl p-5 border border-gray-600">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-gray-200">Step 4: Written Application Draft</h3>
                        <button
                            onClick={() => downloadLetterAsPDF(emi.step4WrittenApplication)}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-1 rounded text-xs transition-colors"
                        >
                            Download PDF
                        </button>
                    </div>
                    <div className="p-5 bg-white text-gray-900 rounded-lg whitespace-pre-wrap font-serif text-sm shadow-inner" id="bank-letter">
                        {emi.step4WrittenApplication.split(/(\[.*?\])/).map((part, i) => {
                            if (part.startsWith('[') && part.endsWith(']')) {
                                return <span key={i} className="bg-yellow-200 text-yellow-900 px-1 rounded mx-0.5 font-bold">{part}</span>;
                            }
                            return part;
                        })}
                    </div>
                </div>

                <div className="bg-red-900/20 border border-red-500/30 rounded-xl p-5">
                    <h3 className="text-lg font-bold text-red-400 mb-2">Step 5: File Complaint (If Bank Refuses)</h3>
                    <p className="text-gray-300 text-sm">{emi.step5RbiOmbudsman}</p>
                </div>

            </div>
        );
    };

    const renderApply = () => {
        if (isLoading && !data.qualifiedSchemes) {
            return <div className="p-8 text-center text-gray-400 font-mono animate-pulse">Gathering application links...</div>;
        }

        if (!data.qualifiedSchemes || data.qualifiedSchemes.length === 0) {
            return (
                <div className="p-8 text-center text-gray-400">
                    No active applications available.
                </div>
            );
        }

        return (
            <div className="space-y-4">
                <h3 className="text-xl font-bold text-gray-200 mb-4 px-2">Official Portals</h3>
                <div className="grid gap-3">
                    {data.qualifiedSchemes.map((scheme, i) => (
                        <a
                            key={i}
                            href={scheme.applicationLink}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center justify-between p-4 bg-gray-800 hover:bg-gray-700 border border-gray-600 rounded-xl transition-colors group cursor-pointer"
                        >
                            <div>
                                <div className="font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">{scheme.schemeName}</div>
                                <div className="text-xs text-gray-400 mt-1">{scheme.whereToApply}</div>
                            </div>
                            <span className="text-2xl opacity-50 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1">→</span>
                        </a>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="w-full max-w-4xl mx-auto bg-[#0A0A0A] border border-gray-800 rounded-xl shadow-2xl overflow-hidden font-sans my-4 z-10 relative">
            {/* Disclaimer Bar */}
            <div className="bg-amber-500/10 border-b border-amber-500/20 px-4 py-2 text-xs text-amber-500/90 text-center font-medium">
                ⚠️ FINANCE GUARD is an AI tool. Use this budget as a guide and consult official portals for scheme details.
            </div>

            {/* Header Tabs */}
            <div className="flex border-b border-gray-800 bg-[#111]">
                <TabButton name="schemes" label="Gov Schemes" icon="🪪" />
                <TabButton name="budget" label="Your Budget" icon="📊" />
                <TabButton name="emi" label="EMI Help" icon="🏦" />
                <TabButton name="apply" label="Apply Now" icon="🌐" />
            </div>

            {/* Content Area */}
            <div className="p-4 sm:p-6 min-h-[400px]">
                {/* Global Error */}
                {renderError("general")}

                {/* Tab Content */}
                {activeTab === "schemes" && renderSchemes()}
                {activeTab === "budget" && renderBudget()}
                {activeTab === "emi" && renderEmi()}
                {activeTab === "apply" && renderApply()}
            </div>
        </div>
    );
}
