'use client';
import { Send, Image as ImageIcon, Mic, X, Loader2 } from 'lucide-react';
import { useState, KeyboardEvent, useRef } from 'react';

export default function InputArea({ onSend, disabled }: { onSend: (text: string, fileData?: { name: string, base64: string, type: string }) => void; disabled: boolean }) {
    const [input, setInput] = useState('');
    const [fileData, setFileData] = useState<{ name: string, base64: string, type: string } | null>(null);
    const [isListening, setIsListening] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSend = () => {
        if ((!input.trim() && !fileData) || disabled) return;
        onSend(input, fileData || undefined);
        setInput('');
        setFileData(null);
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target?.result as string;
                setFileData({ name: file.name, base64, type: file.type });
            };
            reader.readAsDataURL(file);
        }
    };

    const toggleMic = () => {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            alert('Speech Recognition is not supported in this browser.');
            return;
        }

        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRec();

        recognition.continuous = false;
        recognition.interimResults = false;

        recognition.onstart = () => setIsListening(true);
        recognition.onend = () => setIsListening(false);
        recognition.onresult = (event: any) => {
            const transcript = event.results[0][0].transcript;
            setInput(prev => prev + (prev.trim() ? " " : "") + transcript);
        };
        recognition.onerror = (e: any) => {
            console.error("Speech recognition error", e);
            setIsListening(false);
        };

        if (isListening) {
            recognition.stop();
        } else {
            recognition.start();
        }
    };

    return (
        <div className="p-4 max-w-4xl mx-auto w-full">
            {fileData && (
                <div className="mb-2 inline-flex items-center bg-gray-800 rounded-lg px-3 py-1.5 text-sm">
                    <span className="text-gray-300 truncate max-w-[200px]">{fileData.name}</span>
                    <button onClick={() => setFileData(null)} className="ml-2 text-gray-400 hover:text-white">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            )}
            <div className="relative bg-[#1e1f20] rounded-full border border-gray-700/50 focus-within:border-gray-500/50 transition-colors flex items-center p-2 shadow-lg">
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept="image/*,.pdf,.docx,.pptx,.txt"
                />
                <button
                    onClick={() => fileInputRef.current?.click()}
                    className="p-3 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-700/30"
                >
                    <ImageIcon className="w-5 h-5" />
                </button>

                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Gemini..."
                    className="flex-1 bg-transparent border-none focus:ring-0 text-white placeholder-gray-500 px-4 py-3"
                    disabled={disabled}
                />

                {(input.trim() || fileData) ? (
                    <button
                        onClick={handleSend}
                        disabled={disabled}
                        className="p-3 bg-white text-black hover:bg-gray-200 transition-colors rounded-full"
                    >
                        <Send className="w-5 h-5" />
                    </button>
                ) : (
                    <button
                        onClick={toggleMic}
                        className={`p-3 transition-colors rounded-full ${isListening ? 'text-red-500 bg-red-500/20' : 'text-gray-400 hover:text-white hover:bg-gray-700/30'}`}
                    >
                        {isListening ? <Loader2 className="w-5 h-5 animate-spin" /> : <Mic className="w-5 h-5" />}
                    </button>
                )}
            </div>
            <div className="text-center text-xs text-gray-500 mt-2">
                Gemini displays inaccurate info, including about people, so double-check its responses.
            </div>
        </div>
    );
}
