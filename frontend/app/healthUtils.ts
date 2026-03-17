// frontend/app/healthUtils.ts
import jsPDF from "jspdf";

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

        // Determine if it's an object or an array based on which comes first
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
                // 3. Last resort aggressive sanitization
                console.warn("Sliced JSON parse failed, attempting aggressive sanitization...");
                const sanitized = sliced
                    .replace(/[\u0000-\u001F]+/g, "")
                    .replace(/\\"/g, '"')
                    .replace(/\\n/g, "\\n");

                try {
                    return JSON.parse(sanitized);
                } catch (finalError) {
                    console.error("Failed to parse JSON even after sanitization:", sliced);
                    return null; // Don't throw, just return null so UI handles it gracefully
                }
            }
        }

        console.error("Could not find any JSON brackets in the text string.");
        return null;
    }
}

/**
 * Basic HTML to PDF converter using jsPDF for the medical leave letter.
 */
export function downloadLetterAsPDF(text: string, filename = "Medical_Leave_Letter.pdf") {
    const doc = new jsPDF();
    const cleanText = text
        .replace(/\*\*/g, "") // remove bold markdown
        .replace(/## /g, "") // remove headers
        .replace(/# /g, "");

    const splitText = doc.splitTextToSize(cleanText, 180);

    let yPos = 10;
    const pageHeight = doc.internal.pageSize.height;

    splitText.forEach((line: string) => {
        if (yPos > pageHeight - 15) {
            doc.addPage();
            yPos = 10;
        }
        doc.text(line, 15, yPos);
        yPos += 7;
    });

    doc.save(filename);
}

/**
 * Opens Google Maps in a new tab with the pre-filled search query.
 */
export function openGoogleMaps(searchTerm: string) {
    const encodedQuery = encodeURIComponent(searchTerm);
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodedQuery}`, "_blank", "noopener,noreferrer");
}
