import React from 'react';

const EMOTION_STYLES: Record<string, { emoji: string, color: string }> = {
    FRUSTRATED: { emoji: "😡", color: "bg-red-500/10 text-red-500 border-red-500/30" },
    PANICKED: { emoji: "😰", color: "bg-orange-500/10 text-orange-500 border-orange-500/30" },
    DISTRESSED: { emoji: "😔", color: "bg-purple-900/40 text-purple-400 border-purple-500/30" },
    CALM: { emoji: "😐", color: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
    EXCITED: { emoji: "😊", color: "bg-green-500/10 text-green-400 border-green-500/30" },
    EXHAUSTED: { emoji: "😩", color: "bg-gray-500/10 text-gray-400 border-gray-500/30" }
};

export default function EmotionBadge({ currentEmotion = "CALM" }: { currentEmotion?: string }) {
    const style = EMOTION_STYLES[currentEmotion] || EMOTION_STYLES.CALM;

    return (
        <div className={`
            flex items-center gap-2 px-3 py-1.5 rounded-full border shadow-sm backdrop-blur-md
            transition-all duration-300 ease-in-out
            ${style.color}
        `}>
            <span className="text-sm drop-shadow-md">{style.emoji}</span>
            <span className="text-xs font-bold tracking-widest">{currentEmotion}</span>
        </div>
    );
}
