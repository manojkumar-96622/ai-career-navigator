import jsPDF from "jspdf";

/**
 * Helper to call Gemini Generate Content API directly from the backend
 * @param prompt The string prompt to send
 * @returns The raw string response
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
 * Handles standard JSON, JSON wrapped in markdown code blocks,
 * and JSON wrapped in a larger markdown structure.
 */
export function extractJSON(text: string): any {
    // 1. Isolate the JSON block if it's wrapped in markdown ```json or ```
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = text.match(codeBlockRegex);

    let jsonString = text;

    if (match && match[1]) {
        // If we found a code block containing brackets, use that
        jsonString = match[1];
    } else {
        // 2. If no code block, try to extract just the highest level brackets { } or [ ]
        // to strip out trailing/leading conversational text
        const bracketMatch = text.match(/[\{\[][\s\S]*[\}\]]/);
        if (bracketMatch) {
            jsonString = bracketMatch[0];
        }
    }

    // 3. Clean up common LLM escaping issues before parsing
    try {
        return JSON.parse(jsonString);
    } catch (error) {
        // Fallback: Aggressive sanitization if first pass failed
        console.warn("Standard JSON parse failed, attempting aggressive sanitization...");
        const sanitized = jsonString
            .replace(/[\u0000-\u001F]+/g, "") // Remove control chars
            .replace(/\\"/g, '"')             // Fix double escaped quotes
            .replace(/\\n/g, "\\n");          // keep literal newlines

        try {
            return JSON.parse(sanitized);
        } catch (finalError) {
            console.error("Failed to parse JSON even after sanitization:", jsonString);
            throw new Error("LLM did not return a valid JSON structure.");
        }
    }
}

/**
 * Extremely basic HTML to PDF converter using jsPDF.
 * In a real application, you'd want `html2pdf.js` for complex Tailwind UIs.
 * This is a fallback that just dumps text to PDF.
 */
export function downloadPDF(htmlId: string, filename = "Career_Rescue_Plan.pdf") {
    const element = document.getElementById(htmlId);
    if (!element) {
        console.error("Element not found for PDF generation");
        return;
    }

    const doc = new jsPDF();

    // We'll just strip all HTML tags and dump the raw text for this simplified demo
    const rawText = element.innerText || element.textContent || "";
    const cleanText = rawText.replace(/\n\s*\n/g, '\n\n').trim();

    // Split text so it wraps on the page
    const splitText = doc.splitTextToSize(cleanText, 180);

    // Simple pagination
    let yPos = 10;
    const pageHeight = doc.internal.pageSize.height;

    splitText.forEach((line: string) => {
        if (yPos > pageHeight - 15) {
            doc.addPage();
            yPos = 10;
        }
        doc.text(line, 15, yPos);
        yPos += 7; // line height
    });

    doc.save(filename);
}
