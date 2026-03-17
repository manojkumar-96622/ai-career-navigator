// frontend/app/financeUtils.ts
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
        console.warn("Standard JSON parse failed, attempting aggressive sanitization...");
        const sanitized = jsonString
            .replace(/[\u0000-\u001F]+/g, "")
            .replace(/\\"/g, '"')
            .replace(/\\n/g, "\\n");

        try {
            return JSON.parse(sanitized);
        } catch (finalError) {
            console.error("Failed to parse JSON even after sanitization:", jsonString);
            throw new Error("LLM did not return a valid JSON structure.");
        }
    }
}

/**
 * Calculates budget status
 */
export function calculateBudgetStatus(income: number, expenses: number): "Safe" | "Tight" | "Critical" {
    const remaining = income - expenses;
    if (remaining < 0) return "Critical";
    if (remaining < (income * 0.1)) return "Tight"; // Less than 10% buffer
    return "Safe";
}

/**
 * Basic HTML to PDF converter using jsPDF for the bank letter.
 */
export function downloadLetterAsPDF(text: string, filename = "Bank_Moratorium_Letter.pdf") {
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
 * Formats a number as Indian Rupee
 */
export function formatCurrency(amount: number | string): string {
    const num = typeof amount === "string" ? parseFloat(amount) : amount;
    if (isNaN(num)) return "₹0";
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(num);
}
