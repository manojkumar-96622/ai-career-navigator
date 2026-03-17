'use client';
import { MessageSquarePlus, Settings, History, Menu } from 'lucide-react';

export default function Sidebar({ isOpen, setIsOpen }: { isOpen: boolean; setIsOpen: (v: boolean) => void }) {
    return (
        <aside
            className={`fixed inset-y-0 left-0 z-50 w-72 bg-[#1e1f20] transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'
                } md:relative md:translate-x-0 border-r border-gray-700/30 flex flex-col`}
        >
            <div className="p-4 flex items-center justify-between">
                <button onClick={() => setIsOpen(!isOpen)} className="p-2 hover:bg-white/10 rounded-full md:hidden">
                    <Menu className="w-6 h-6" />
                </button>
                <span className="text-xl font-semibold opacity-80 pl-2">Gemini</span>
            </div>

            <div className="px-4 py-2">
                <button className="flex items-center gap-3 w-full p-3 bg-[#282a2c] hover:bg-[#37393b] rounded-full text-sm font-medium transition-colors text-[#e3e3e3]">
                    <MessageSquarePlus className="w-5 h-5 text-gray-400" />
                    New chat
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-2">
                <div className="text-xs font-medium text-gray-400 mb-2 mt-4 ml-2">Recent</div>
                {/* Mock History */}
                <div className="space-y-1">
                    {['React Hooks Explanation', 'Python Script Debugging', 'Trip to Paris Plan'].map((item, i) => (
                        <button key={i} className="flex items-center gap-3 w-full p-2 hover:bg-white/5 rounded-full text-sm text-gray-300 truncate">
                            <History className="w-4 h-4 text-gray-400" />
                            <span className="truncate">{item}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="p-4 border-t border-gray-700/30">
                <button className="flex items-center gap-3 w-full p-2 hover:bg-white/5 rounded-lg text-sm transition-colors text-[#e3e3e3]">
                    <Settings className="w-5 h-5 text-gray-400" />
                    Settings
                </button>
            </div>
        </aside>
    );
}
