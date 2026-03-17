// frontend/app/mindUtils.ts
import { INDIAN_HELPLINES } from "./helplineData";
import { EXERCISES } from "./exerciseData";

/**
 * Helper to call Gemini Generate Content API directly from the backend
 */
export async function callGemini(prompt: string, retries = 3): Promise<string> {
    const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

    for (let attempt = 0; attempt < retries; attempt++) {
        const response = await fetch(`${BASE}/generate`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            let errorDetails = response.statusText;
            try {
                const errorData = await response.json();
                errorDetails = JSON.stringify(errorData);
            } catch (e) {
                // Ignore
            }

            if (attempt < retries - 1) {
                const waitTime = (attempt + 1) * 2000;
                console.warn(`[Agent API] Rate Limit or Error. Retrying in ${waitTime}ms...`);
                await new Promise(r => setTimeout(r, waitTime));
                continue;
            }
            throw new Error(`Agent API Error: ${errorDetails}`);
        }

        const data = await response.json();
        if (data.text) {
            return data.text;
        }
        throw new Error("Invalid response format from backend Generate endpoint");
    }
    throw new Error("Max retries reached for API");
}

/**
 * Safely extracts JSON from a markdown response
 */
export function extractJSON(text: string): any {
    if (!text) return null;

    // 1. Try finding a json code block
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = text.match(codeBlockRegex);

    let jsonString = text;
    if (match && match[1]) {
        jsonString = match[1];
    }

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        // 2. Fallback: Find the first { or [ and last } or ]
        const firstBrace = jsonString.indexOf('{');
        const firstBracket = jsonString.indexOf('[');
        const lastBrace = jsonString.lastIndexOf('}');
        const lastBracket = jsonString.lastIndexOf(']');

        let startIndex = -1;
        let endIndex = -1;

        if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
            startIndex = firstBrace;
            endIndex = lastBrace;
        } else if (firstBracket !== -1) {
            startIndex = firstBracket;
            endIndex = lastBracket;
        }

        if (startIndex !== -1 && endIndex !== -1 && endIndex > startIndex) {
            const sliced = jsonString.substring(startIndex, endIndex + 1);
            try {
                return JSON.parse(sliced);
            } catch (slicedError) {
                const sanitized = sliced
                    .replace(/[\u0000-\u001F]+/g, "")
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, "\\n");

                try {
                    return JSON.parse(sanitized);
                } catch (finalError) {
                    return null;
                }
            }
        }
        return null;
    }
}

/**
 * Returns filtered helplines array based on crisis level 
 * from helplineData.js
 */
export function getHelplinesByCrisisLevel(level: string) {
    if (level === "SEVERE") {
        return INDIAN_HELPLINES; // all of them
    } else if (level === "HIGH") {
        return INDIAN_HELPLINES.slice(0, 3); // top 3
    } else {
        // MODERATE or LOW
        return INDIAN_HELPLINES.filter(h => h.name === 'iCALL' || h.name === 'VANDREVALA FOUNDATION');
    }
}

/**
 * Returns correct exercise object or null for SEVERE from exerciseData.js
 */
export function getExerciseByCrisisLevel(level: string) {
    if (level === "SEVERE") {
        return null;
    }
    return EXERCISES[level] || EXERCISES["LOW"];
}

/**
 * Builds a properly encoded WhatsApp share URL
 */
export function generateWhatsAppLink(text: string) {
    const defaultNumber = "919876543210"; // Placeholder ATLAS bot number
    return `https://wa.me/${defaultNumber}?text=${encodeURIComponent(text)}`;
}
