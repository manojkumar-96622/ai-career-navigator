import React, { useState } from 'react';
import { LegalRescueResult } from './legalShieldAgent';
import { downloadDocumentAsPDF, highlightPlaceholders } from './legalUtils';

type TabType = 'rights' | 'laws' | 'document' | 'guide';

interface LegalShieldUIProps {
    result: LegalRescueResult;
    isComplete: boolean;
}

export default function LegalShieldUI({ result, isComplete }: LegalShieldUIProps) {
    const [activeTab, setActiveTab] = useState<TabType>('rights');

    const tabs: { id: TabType; label: string; icon: string }[] = [
        { id: 'rights', label: 'Your Rights', icon: '⚖️' },
        { id: 'laws', label: 'Applicable Laws', icon: '📖' },
        { id: 'document', label: 'Your Document', icon: '📝' },
        { id: 'guide', label: 'What To Do Next', icon: '🗺️' },
    ];

    const renderLoader = (text: string) => (
        <div className="flex flex-col items-center justify-center p-12 text-blue-400">
            <div className="w-10 h-10 border-4 border-blue-500/30 border-t-blue-500 rounded-full animate-spin mb-4 shadow-[0_0_15px_rgba(59,130,246,0.5)]"></div>
            <p className="text-sm font-medium animate-pulse tracking-wide">{text}</p>
        </div>
    );

    const renderError = (msg: string) => (
        <div className="bg-red-950/40 border border-red-800/50 rounded-xl p-6 text-red-300 text-sm shadow-inner flex items-start gap-3">
            <span className="text-xl">⚠️</span>
            <div>
                <strong className="block text-red-400 mb-1 font-semibold tracking-wide">Generation Failed</strong>
                {msg}
            </div>
        </div>
    );

    // Basic markdown parsing for the generated document
    const parseMarkdown = (text: string) => {
        let html = text
            .replace(/## (.*$)/gim, '<h2 class="text-xl font-bold text-white mt-6 mb-3 border-b border-slate-700/50 pb-2 drop-shadow-sm">$1</h2>')
            .replace(/# (.*$)/gim, '<h1 class="text-2xl font-black text-blue-100 mt-8 mb-4 tracking-tight drop-shadow-md">$1</h1>')
            .replace(/\*\*(.*?)\*\*/gim, '<strong class="font-bold text-blue-200 bg-blue-900/10 px-1 rounded">$1</strong>')
            .replace(/\*(.*?)\*/gim, '<em class="text-slate-200 italic">$1</em>')
            .replace(/\n\n/g, '<br/><br/>')
            .replace(/\n(?!(?:<br|<h|<l))/g, '<br/>');

        // Apply placeholder highlighting matching [TEXT]
        html = highlightPlaceholders(html);

        return html;
    };

    return (
        <div className="w-full max-w-5xl mx-auto bg-[#0d1321] border border-slate-800/60 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)] relative">

            {/* Header */}
            <div className="bg-gradient-to-r from-red-900/60 via-[#111827] to-slate-900 border-b border-white/5 px-8 py-5 flex justify-between items-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-20 mix-blend-overlay"></div>
                <div className="relative z-10 flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-500/10 border border-red-500/20 shadow-inner">
                        <span className="text-xl">🛡️</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold font-sans tracking-wide text-white drop-shadow-sm">Legal Shield Report</h2>
                        <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">Strategic AI Defense</p>
                    </div>
                </div>
                {!isComplete && (
                    <div className="relative z-10 flex items-center gap-3 text-xs font-semibold tracking-widest uppercase text-red-300 bg-red-900/40 px-4 py-2 rounded-full border border-red-500/30 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-red-400 animate-ping"></span>
                        Analyzing Claims...
                    </div>
                )}
            </div>

            {/* Permanent Disclaimer */}
            <div className="bg-amber-950/40 border-b border-amber-900/40 px-6 py-3 text-[11px] text-amber-200 flex items-center gap-3">
                <span className="text-amber-500 text-lg">⚠️</span>
                <p className="font-medium tracking-wide">
                    <strong>ARIA is an AI assistant, not a lawyer.</strong> This information is for educational purposes only. Always consult a qualified advocate before taking legal action.
                </p>
            </div>

            {/* Tabs Nav */}
            <div className="flex border-b-2 border-slate-700 bg-slate-900/80 backdrop-blur-md px-4 pt-4 gap-2 overflow-x-auto custom-scrollbar relative">
                {tabs.map(tab => {
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-4 text-base font-bold rounded-t-xl transition-all duration-300 ease-out focus:outline-none whitespace-nowrap ${isActive
                                ? 'text-white bg-[#0d1321] border-t-2 border-l border-r border-t-red-400 border-l-slate-700/60 border-r-slate-700/60 shadow-[0_-4px_15px_rgba(239,68,68,0.15)] drop-shadow-md z-10 relative'
                                : 'text-slate-300 hover:text-white hover:bg-slate-800/80 border-t border-l border-r border-transparent'
                                }`}
                        >
                            <span className={isActive ? 'opacity-100' : 'opacity-60'}>{tab.icon}</span>
                            <span>{tab.label}</span>
                        </button>
                    );
                })}
            </div>

            {/* Tab Content Area */}
            <div className="p-8 max-h-[700px] min-h-[300px] overflow-y-auto custom-scrollbar relative bg-[#090d16]">
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0d1321]/50 to-black/40 pointer-events-none"></div>

                <div className="relative z-10">

                    {/* TAB 1 - YOUR RIGHTS */}
                    {activeTab === 'rights' && (
                        <div className="animate-fade-in space-y-6 max-w-2xl mx-auto">
                            {!result.rightsExplanation && !result.errors?.rightsExplanation && renderLoader("Extracting human rights and protections...")}
                            {result.errors?.rightsExplanation && renderError(result.errors.rightsExplanation)}

                            {result.rightsExplanation && (
                                <div className="bg-[#111827]/80 backdrop-blur text-slate-200 rounded-2xl shadow-xl overflow-hidden border border-slate-700/50">
                                    <div className="bg-[#0d1321] border-b border-slate-700/50 p-6 flex flex-col items-center">
                                        <div className="w-16 h-16 bg-blue-900/40 border border-blue-500/30 text-blue-400 rounded-full flex items-center justify-center text-3xl mb-4 shadow-sm">
                                            ⚖️
                                        </div>
                                        <h3 className="text-xl font-bold text-center tracking-tight text-white">Your Legal Protections</h3>
                                    </div>
                                    <div className="p-8 text-[15px] leading-relaxed font-medium">
                                        {result.rightsExplanation.split('\n').map((para, i) => (
                                            <p key={i} className="mb-4 text-slate-300 last:mb-0">
                                                <span dangerouslySetInnerHTML={{ __html: para.replace(/\*\*(.*?)\*\*/g, '<strong class="text-blue-300">$1</strong>') }} />
                                            </p>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 2 - APPLICABLE LAWS */}
                    {activeTab === 'laws' && (
                        <div className="animate-fade-in max-w-3xl mx-auto">
                            {!result.applicableLaws && !result.errors?.general && renderLoader("Scanning Indian Penal Code and Civil Statutes...")}
                            {result.errors?.general && renderError(result.errors.general)}

                            {result.legalCategory && (
                                <div className="mb-8 text-center bg-blue-900/30 border border-blue-500/30 p-4 rounded-xl shadow-inner inline-block mx-auto flex flex-col w-max">
                                    <span className="text-xs uppercase tracking-widest text-blue-300 font-bold block mb-1">Detected Issue</span>
                                    <span className="text-lg font-bold text-white drop-shadow-md">{result.legalCategory}</span>
                                </div>
                            )}

                            {result.applicableLaws && (
                                <div className="grid gap-4">
                                    {result.applicableLaws.map((law, idx) => (
                                        <div key={idx} className="bg-[#111827] border border-slate-700/80 p-6 rounded-xl shadow-md hover:border-blue-500/50 transition-colors">
                                            <div className="flex justify-between items-start mb-3">
                                                <h4 className="text-base font-bold text-blue-200">{law.lawName}</h4>
                                                <span className="bg-blue-500/10 text-blue-300 text-xs font-bold px-3 py-1 rounded-full border border-blue-500/20">
                                                    {law.sectionNumber}
                                                </span>
                                            </div>
                                            <p className="text-[13px] text-slate-300 leading-relaxed font-medium">{law.explanation}</p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 3 - YOUR DOCUMENT */}
                    {activeTab === 'document' && (
                        <div className="animate-fade-in">
                            {!result.draftedDocument && !result.errors?.draftedDocument && renderLoader("Drafting official complaint/notice...")}
                            {result.errors?.draftedDocument && renderError(result.errors.draftedDocument)}

                            {result.draftedDocument && (
                                <div className="bg-[#111827] border border-slate-700/80 rounded-sm p-10 max-w-3xl mx-auto shadow-[0_10px_40px_rgba(0,0,0,0.5)] relative">
                                    <div className="absolute top-0 right-0 p-4 flex gap-2">
                                        <button
                                            onClick={() => {
                                                navigator.clipboard.writeText(result.draftedDocument || "");
                                            }}
                                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-600 rounded text-xs font-bold transition-colors"
                                        >
                                            Copy
                                        </button>
                                        <button
                                            onClick={() => downloadDocumentAsPDF(result.draftedDocument || "No document", "Legal_Draft.pdf")}
                                            className="px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-lg shadow-blue-900/40 border border-blue-500/50 rounded text-xs font-bold transition-colors"
                                        >
                                            Download PDF
                                        </button>
                                    </div>

                                    <div className="h-6 mb-6 border-b-2 border-slate-700/50 w-1/4 mx-auto"></div>

                                    <div
                                        className="text-slate-300 font-serif text-[14px] leading-loose whitespace-pre-wrap"
                                        dangerouslySetInnerHTML={{ __html: parseMarkdown(result.draftedDocument) }}
                                    ></div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* TAB 4 - WHAT TO DO NEXT */}
                    {activeTab === 'guide' && (
                        <div className="animate-fade-in max-w-3xl mx-auto">
                            {!result.submissionGuide && !result.errors?.submissionGuide && renderLoader("Building tactical submission roadmap...")}
                            {result.errors?.submissionGuide && renderError(result.errors.submissionGuide)}

                            {result.submissionGuide && (
                                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-700/50 before:to-transparent">

                                    {/* Step 1 */}
                                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full border border-indigo-500/30 bg-[#111827] text-indigo-400 font-bold shadow-md shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                            1
                                        </div>
                                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-5 rounded-xl border border-slate-700/50 bg-[#111827]/80 backdrop-blur shadow-sm">
                                            <h4 className="text-indigo-200 font-bold mb-1 text-sm">Where To Go</h4>
                                            <p className="text-slate-300 text-[13px]">{result.submissionGuide?.whereToGo}</p>
                                            <span className="inline-block mt-2 text-[11px] text-slate-400 italic">💡 {result.submissionGuide?.howToFindIt}</span>
                                        </div>
                                    </div>

                                    {/* Step 2 */}
                                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full border border-emerald-500/30 bg-[#111827] text-emerald-400 font-bold shadow-md shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                            2
                                        </div>
                                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-5 rounded-xl border border-slate-700/50 bg-[#111827]/80 backdrop-blur shadow-sm">
                                            <h4 className="text-emerald-200 font-bold mb-2 text-sm">Documents to Carry</h4>
                                            <ul className="space-y-1">
                                                {result.submissionGuide?.documentsToCarry?.map((doc, idx) => (
                                                    <li key={idx} className="flex gap-2 text-[13px] text-slate-300">
                                                        <span className="text-emerald-500">☑</span> {doc}
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>

                                    {/* Step 3 */}
                                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full border border-amber-500/30 bg-[#111827] text-amber-400 font-bold shadow-md shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                            3
                                        </div>
                                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-5 rounded-xl border border-slate-700/50 bg-[#111827]/80 backdrop-blur shadow-sm">
                                            <h4 className="text-amber-200 font-bold mb-1 text-sm">Filing Fee</h4>
                                            <p className="text-slate-300 text-[13px] font-mono bg-slate-900/50 p-2 rounded inline-block">{result.submissionGuide?.filingFee}</p>
                                        </div>
                                    </div>

                                    {/* Step 4 */}
                                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full border border-red-500/30 bg-[#111827] text-red-400 font-bold shadow-md shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                            4
                                        </div>
                                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-5 rounded-xl border border-red-900/30 bg-red-950/20 backdrop-blur shadow-sm">
                                            <h4 className="text-red-300 font-bold mb-1 text-sm flex items-center gap-2">
                                                <span>⏳ Time Limit</span>
                                            </h4>
                                            <p className="text-red-200/80 text-[13px] font-medium">{result.submissionGuide?.timeLimit}</p>
                                        </div>
                                    </div>

                                    {/* Step 5 */}
                                    <div className="relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active">
                                        <div className="flex items-center justify-center w-12 h-12 rounded-full border border-purple-500/30 bg-[#111827] text-purple-400 font-bold shadow-md shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 z-10">
                                            5
                                        </div>
                                        <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-5 rounded-xl border border-slate-700/50 bg-[#111827]/80 backdrop-blur shadow-sm">
                                            <h4 className="text-purple-200 font-bold mb-1 text-sm">What Happens Next</h4>
                                            <p className="text-slate-300 text-[13px] leading-relaxed">{result.submissionGuide?.whatHappensNext}</p>
                                        </div>
                                    </div>

                                </div>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
