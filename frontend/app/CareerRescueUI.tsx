import React, { useState } from 'react';
import { CareerRescueResult, JobMatch, RecruiterEmail, TrackerRow } from './careerRescueAgent';
import { downloadPDF } from './careerUtils';

interface CareerRescueUIProps {
    result: Partial<CareerRescueResult>;
    isComplete: boolean;
}

type TabType = 'resume' | 'jobs' | 'emails' | 'tracker';

export default function CareerRescueUI({ result, isComplete }: CareerRescueUIProps) {
    const [activeTab, setActiveTab] = useState<TabType>('resume');

    const tabs: { id: TabType; label: string; icon: string }[] = [
        { id: 'resume', label: 'Resume', icon: '' },
        { id: 'jobs', label: 'Job Matches', icon: '' },
        { id: 'emails', label: 'Recruiter Emails', icon: '' },
        { id: 'tracker', label: 'Application Tracker', icon: '' },
    ];

    const renderLoader = (text: string) => (
        <div className="flex flex-col items-center justify-center p-16 text-blue-400/80">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-400 mb-6 flex-shrink-0"></div>
            <p className="animate-pulse tracking-wide font-medium text-sm border border-blue-500/30 bg-blue-900/20 px-4 py-2 rounded-full uppercase">{text}</p>
        </div>
    );

    const renderError = (error: string | undefined) => (
        <div className="p-6 bg-red-950/30 border-l-4 border-red-500 rounded-r-lg text-red-200 my-6 shadow-lg">
            <h4 className="font-bold mb-2 flex items-center gap-2"><span>⚠️</span> Generation Error</h4>
            <p className="font-mono text-sm opacity-80">{error}</p>
        </div>
    );

    const handleCopy = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    const handleCopyAll = () => {
        const text = `
RESUME:
${result.resume || 'Not generated'}

JOB MATCHES:
${result.jobs?.map(j => `${j.jobTitle} at ${j.applyWhere}\nWhy: ${j.matchReason}\nTip: ${j.tip}`).join('\n\n') || 'Not generated'}

EMAILS:
${result.emails?.map(e => `Subject: ${e.subject}\n\n${e.body}`).join('\n\n---\n\n') || 'Not generated'}

TRACKER:
${result.tracker?.map(t => `${t.jobTitle} - ${t.status}`).join('\n') || 'Not generated'}
        `;
        handleCopy(text.trim());
    };

    // Helper function to safely parse basic markdown into HTML for UI rendering
    const parseMarkdown = (text: string) => {
        if (!text) return "";
        let html = text
            // Parse headers (e.g., ## Header)
            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
            // Parse bold text
            .replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>')
            // Parse bullet points
            .replace(/^\* (.*$)/gim, '<li>$1</li>')
            // Parse newlines
            .replace(/\n\n/g, '<br/><br/>')
            .replace(/\n(?!(?:<br|<h|<l))/g, '<br/>');

        // Wrap consecutive <li> into a <ul> (primitive implementation for simple LLM lists)
        html = html.replace(/(<li>.*<\/li>(?:<br\/>)*)+/gim, match => {
            return `<ul>${match.replace(/<br\/>/g, '')}</ul>`;
        });

        return html;
    };

    // Typography classes
    const textBody = "font-sans text-gray-300 leading-relaxed antialiased";
    const textHeading = "font-sans font-semibold tracking-tight text-gray-100";

    return (
        <div className="w-full max-w-5xl mx-auto bg-[#0d1321] border border-slate-800/60 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgb(0,0,0,0.5)]">
            {/* Header */}
            <div className="bg-gradient-to-r from-slate-900 via-[#111827] to-slate-900 border-b border-white/5 px-8 py-5 flex justify-between items-center relative overflow-hidden">
                <div className="absolute inset-0 opacity-20 mix-blend-overlay"></div>
                <div className="relative z-10 flex items-center gap-4">
                    <div className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-500/10 border border-blue-500/20 shadow-inner">
                        <span className="text-xl">💼</span>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold font-sans tracking-wide text-white drop-shadow-sm">Career Rescue Plan</h2>
                        <p className="text-xs font-medium text-slate-400 mt-1 uppercase tracking-wider">Strategic AI Output</p>
                    </div>
                </div>
                {!isComplete && (
                    <div className="relative z-10 flex items-center gap-3 text-xs font-semibold tracking-widest uppercase text-blue-300 bg-blue-900/40 px-4 py-2 rounded-full border border-blue-500/30 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
                        Synthesizing...
                    </div>
                )}
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
                                ? 'text-white bg-[#0d1321] border-t-2 border-l border-r border-t-blue-400 border-l-slate-700/60 border-r-slate-700/60 shadow-[0_-4px_15px_rgba(59,130,246,0.15)] drop-shadow-md z-10 relative'
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
            <div className={`p-8 max-h-[700px] min-h-[300px] overflow-y-auto custom-scrollbar relative bg-[#090d16]`}>

                {/* Subtle global gradient background for the content area to separate from headers */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0d1321]/50 to-black/40 pointer-events-none"></div>

                <div className="relative z-10">
                    {/* RESUME TAB */}
                    {activeTab === 'resume' && (
                        <div className="animate-fade-in">
                            {!result.resume && !result.errors?.resume && renderLoader("Drafting a high-impact professional resume...")}
                            {result.errors?.resume && renderError(result.errors.resume)}
                            {result.resume && (
                                <div className="bg-[#111827] border border-slate-700/50 rounded-xl p-8 shadow-inner relative overflow-hidden">
                                    <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/5 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none"></div>
                                    <div className={`prose prose-invert prose-blue max-w-none ${textBody} prose-headings:${textHeading} prose-a:text-blue-400 prose-ul:opacity-90 prose-ul:list-disc prose-ul:ml-5`}
                                        dangerouslySetInnerHTML={{ __html: parseMarkdown(result.resume || "") }} />
                                </div>
                            )}
                        </div>
                    )}

                    {/* JOBS TAB */}
                    {activeTab === 'jobs' && (
                        <div>
                            {!result.jobs && !result.errors?.jobs && renderLoader("Analyzing job markets & fetching matches...")}
                            {result.errors?.jobs && renderError(result.errors.jobs)}
                            {result.jobs && (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                                    {result.jobs.map((job, i) => (
                                        <div key={i} className="bg-gradient-to-b from-[#111827] to-[#0f1523] border border-slate-700/50 p-6 rounded-2xl hover:border-blue-500/50 transition-all duration-300 group shadow-md hover:shadow-blue-900/20 relative overflow-hidden">
                                            {/* Accent left border */}
                                            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-blue-400 to-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity"></div>

                                            <div className="flex justify-between items-start mb-4">
                                                <h3 className={`${textHeading} text-lg text-blue-100 group-hover:text-blue-300 transition-colors`}>{job.jobTitle}</h3>
                                                <span className="text-[10px] uppercase tracking-wider bg-indigo-950 text-indigo-300 px-3 py-1.5 rounded-full border border-indigo-800/60 font-medium shadow-sm whitespace-nowrap ml-3">
                                                    {job.applyWhere}
                                                </span>
                                            </div>

                                            <div className="mb-5">
                                                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-2">Why It's a Match</span>
                                                <p className={`${textBody} text-sm line-clamp-3`}>{job.matchReason}</p>
                                            </div>

                                            <div className="bg-[#1a2333]/80 p-4 rounded-xl border border-slate-700/60 flex gap-3 items-start mt-auto shadow-inner">
                                                <span className="text-yellow-500/90 text-sm mt-0.5">💡</span>
                                                <div>
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80 block mb-1">Key Takeaway</span>
                                                    <span className="text-sm font-medium text-blue-100/90 leading-snug">{job.tip}</span>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* EMAILS TAB */}
                    {activeTab === 'emails' && (
                        <div>
                            {!result.emails && !result.errors?.emails && renderLoader("Drafting personalized outreach strategies...")}
                            {result.errors?.emails && renderError(result.errors.emails)}
                            {result.emails && (
                                <div className="space-y-8 animate-fade-in max-w-4xl mx-auto">
                                    {result.emails.map((email, i) => (
                                        <div key={i} className="bg-[#111827] border border-slate-700/60 rounded-2xl overflow-hidden shadow-lg group hover:border-slate-500/80 transition-all">
                                            <div className="bg-slate-900/80 px-6 py-4 border-b border-slate-800 flex justify-between items-center relative overflow-hidden">
                                                {/* Card top subtle highlight */}
                                                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-50 group-hover:opacity-100 transition-opacity"></div>

                                                <div className="flex items-center gap-4">
                                                    <div className="w-8 h-8 rounded-full bg-blue-900/60 border border-blue-700/50 text-blue-300 flex items-center justify-center text-sm font-bold shadow-inner">
                                                        {email.emailNumber}
                                                    </div>
                                                    <div>
                                                        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block mb-0.5">Strategy Focus</span>
                                                        <span className="text-sm font-semibold text-gray-200 capitalize tracking-wide">{email.tone} Approach</span>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => handleCopy("Subject: " + email.subject + "\n\n" + email.body)}
                                                    className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg transition-all text-xs font-medium flex items-center gap-2 border border-slate-700 hover:border-slate-500 focus:ring-2 focus:ring-slate-600 outline-none"
                                                >
                                                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                                                    Copy Template
                                                </button>
                                            </div>
                                            <div className="p-8 pb-10">
                                                <div className="bg-[#0b0f19] rounded-lg p-4 border border-slate-800/80 mb-6 flex flex-col md:flex-row md:items-center gap-2 md:gap-4 shadow-inner">
                                                    <span className="text-[10px] font-bold uppercase tracking-widest text-blue-400/80 flex-shrink-0">Subject Line</span>
                                                    <span className="text-sm font-medium text-white">{email.subject}</span>
                                                </div>
                                                <div className={`${textBody} whitespace-pre-wrap text-[15px] opacity-90`}>
                                                    {email.body}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* TRACKER TAB */}
                    {activeTab === 'tracker' && (
                        <div>
                            {!result.tracker && !result.errors?.tracker && renderLoader("Populating execution framework...")}
                            {result.errors?.tracker && renderError(result.errors.tracker)}
                            {result.tracker && (
                                <div className="rounded-2xl border border-slate-700/60 overflow-hidden shadow-xl bg-[#111827] animate-fade-in relative">
                                    <div className="absolute inset-0 bg-gradient-to-br from-blue-900/5 to-transparent pointer-events-none"></div>
                                    <div className="overflow-x-auto relative z-10 custom-scrollbar pb-2">
                                        <table className="w-full text-sm text-left align-middle min-w-[700px]">
                                            <thead className="bg-[#0b0f19] text-[11px] uppercase tracking-widest text-slate-400 border-b border-slate-700/80">
                                                <tr>
                                                    <th className="px-6 py-5 font-semibold">Target Origin</th>
                                                    <th className="px-6 py-5 font-semibold text-center">Pipeline Stage</th>
                                                    <th className="px-6 py-5 font-semibold text-center">Assets Delivered</th>
                                                    <th className="px-6 py-5 font-semibold">Key Takeaways</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-800/80 text-gray-300">
                                                {result.tracker.map((row, i) => (
                                                    <tr key={i} className="hover:bg-slate-800/40 transition-colors group">
                                                        <td className="px-6 py-5">
                                                            <div className={`${textHeading} text-blue-200 group-hover:text-white transition-colors`}>{row.jobTitle}</div>
                                                            <div className="text-xs text-slate-500 font-medium mt-1">{row.company}</div>
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className="inline-flex items-center justify-center bg-slate-900 text-slate-300 px-3 py-1.5 rounded-full text-[11px] font-medium border border-slate-700 shadow-sm whitespace-nowrap">
                                                                {row.status}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5 text-center">
                                                            <span className={`inline-flex items-center justify-center px-3 py-1.5 rounded-full text-[11px] font-medium border ${row.resumeSent.toLowerCase() === 'no' ? 'bg-slate-900 text-slate-400 border-slate-700/80' : 'bg-green-950/40 text-green-400 border-green-800/60'}`}>
                                                                {row.resumeSent.toLowerCase() === 'no' ? 'Pending' : 'Sent'}
                                                            </span>
                                                        </td>
                                                        <td className="px-6 py-5">
                                                            <div className="bg-[#1a2333]/50 p-3 rounded-lg border border-slate-700/30 text-[13px] italic text-slate-300 leading-relaxed max-w-sm shadow-inner group-hover:bg-[#1a2333] transition-colors">
                                                                {row.notes}
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Footer Action Bar */}
            {isComplete && (
                <div className="bg-[#090d16] border-t border-slate-800/80 p-5 flex flex-col sm:flex-row justify-between items-center gap-4 relative z-20">
                    <p className="text-[10px] font-bold text-slate-500 tracking-widest uppercase">Rescue Outline Completed</p>
                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            onClick={handleCopyAll}
                            className="bg-slate-800 hover:bg-slate-700 text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold tracking-wide transition-all shadow-md flex items-center gap-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                            Copy to Clipboard
                        </button>

                        <button
                            onClick={() => downloadPDF(result.resume || "No resume generated", "Rescue_Plan.pdf")}
                            className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white px-5 py-2.5 rounded-lg text-[13px] font-semibold tracking-wide transition-all shadow-lg shadow-blue-900/40 flex items-center gap-2 border border-blue-500/50 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Download as PDF
                        </button>

                        <button
                            onClick={() => window.open('https://linkedin.com/jobs', '_blank')}
                            className="bg-[#1e293b] hover:bg-slate-700 text-slate-200 px-5 py-2.5 rounded-lg text-[13px] font-semibold tracking-wide transition-all shadow-md flex items-center gap-2 border border-slate-600 focus:outline-none focus:ring-2 focus:ring-slate-500"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>
                            Follow-up
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
