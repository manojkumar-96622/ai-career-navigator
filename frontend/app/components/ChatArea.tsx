'use client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Bot, User } from 'lucide-react';
import { useEffect, useRef } from 'react';

type Message = {
    role: 'user' | 'model';
    text: string;
    linkChips?: Array<{ label: string; url: string }>;
};

export default function ChatArea({ messages, isLoading }: { messages: Message[], isLoading: boolean }) {
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (messagesEndRef.current && scrollContainerRef.current) {
            const container = scrollContainerRef.current;
            const isAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 150;
            if (isAtBottom) {
                messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
            }
        }
    }, [messages, isLoading]);

    return (
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center opacity-80 p-8">
                    <div className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-red-500 bg-clip-text text-transparent mb-8">
                        Hello, Human.
                    </div>
                    <p className="text-xl text-gray-400 mb-10 max-w-lg">How can I help you today?</p>
                </div>
            )}

            {messages.map((msg, idx) => (
                <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'model' && (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shrink-0">
                            <Bot className="w-5 h-5 text-white" />
                        </div>
                    )}
                    <div className={`max-w-[80%] rounded-2xl px-5 py-3 ${msg.role === 'user'
                        ? 'bg-[#282a2c] text-white rounded-tr-sm'
                        : 'text-gray-100'}`}>
                        <div className="prose prose-invert prose-p:leading-relaxed">
                            <ReactMarkdown
                                remarkPlugins={[remarkGfm]}
                                urlTransform={(value: string) => value}
                                components={{
                                    a: ({ node, ...props }) => (
                                        <a {...props} download={props.href?.startsWith('data:') ? 'agent_report.pdf' : undefined} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                                            {props.children}
                                        </a>
                                    )
                                }}
                            >
                                {msg.text}
                            </ReactMarkdown>
                        </div>

                        {/* Rendering Link Chips */}
                        {msg.linkChips && msg.linkChips.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {msg.linkChips.map((chip, cIdx) => (
                                    <a
                                        key={cIdx}
                                        href={chip.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 border border-blue-500/40 rounded-full text-sm text-blue-300 hover:bg-blue-600/40 transition-colors shadow-lg"
                                    >
                                        <span className="w-1.5 h-1.5 bg-blue-400 rounded-full animate-pulse" />
                                        Open {chip.label}
                                    </a>
                                ))}
                            </div>
                        )}
                    </div>
                    {msg.role === 'user' && (
                        <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center shrink-0">
                            <User className="w-5 h-5 text-white" />
                        </div>
                    )}
                </div>
            ))}

            {isLoading && (
                <div className="flex gap-4">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-500 to-purple-500 flex items-center justify-center shrink-0 animate-pulse">
                        <Bot className="w-5 h-5 text-white" />
                    </div>
                    <div className="flex items-center gap-1 h-10 px-4">
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-gray-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                </div>
            )}
            <div ref={messagesEndRef} />
        </div>
    );
}