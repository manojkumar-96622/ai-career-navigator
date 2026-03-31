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
            throw new Error(`Shield Agent API Error: ${errorDetails}`);
        }

        const data = await response.json();
        if (data.text) {
            return data.text;
        }
        throw new Error("Invalid response format from backend Generate endpoint");
    }
    throw new Error("Max retries reached for API");
}

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
