import jsPDF from "jspdf";
import React from "react";

/**
 * Helper to call Gemini Generate Content API directly from the frontend
 */
export async function callGemini(prompt: string, retries = 3): Promise<string> {
    const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

    for (let attempt = 0; attempt < retries; attempt++) {
        const response = await fetch(`${BASE}/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt }),
        });

        if (!response.ok) {
            let errorDetails = response.statusText;
            try {
                const errorData = await response.json();
                errorDetails = JSON.stringify(errorData);
            } catch (e) { /* empty */ }

            if (attempt < retries - 1) {
                const waitTime = (attempt + 1) * 2000;
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
    const codeBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
    const match = text.match(codeBlockRegex);

    let jsonString = text;
    if (match && match[1]) {
        jsonString = match[1];
    } else {
        const bracketMatch = text.match(/[\{\[][\s\S]*[\}\]]/);
        if (bracketMatch) {
            jsonString = bracketMatch[0];
        }
    }

    try {
        return JSON.parse(jsonString);
    } catch (error) {
        console.error("Failed to parse JSON:", jsonString);
        throw new Error("LLM did not return a valid JSON structure.");
    }
}

/**
 * Downloads a simple text string as a PDF Document.
 */
export function downloadDocumentAsPDF(text: string, filename = "Legal_Document.pdf") {
    const doc = new jsPDF();
    const cleanText = text
        .replace(/\*\*/g, "") // remove bold
        .replace(/## /g, "") // remove headers
        .replace(/# /g, "");

    // Add text with splitting for page boundaries. jsPDF handles array of strings well.
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
 * Replaces placeholders (like [USER NAME]) with <mark> tags or react elements.
 * For simplicity in dangerouslySetInnerHTML, returning a string with spans.
 */
export function highlightPlaceholders(text: string): string {
    if (!text) return "";
    // Wrap things in square brackets with a Tailwind styled span
    return text.replace(
        /\[(.*?)\]/g,
        '<span class="bg-yellow-500/20 text-yellow-200 border border-yellow-500/30 px-1 rounded mx-0.5">[$1]</span>'
    );
}
