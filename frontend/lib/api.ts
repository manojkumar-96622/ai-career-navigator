// lib/api.ts — ARIA API utilities
const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080";

export type SSEEvent =
  | { type: "status";     text: string }
  | { type: "tool_start"; name: string }
  | { type: "tool_done";  name: string; preview: string }
  | { type: "open_urls";  urls: string[] }
  | { type: "map_url";    url: string }
  | { type: "text";       text: string }
  | { type: "done";       redirect_urls: string[] }
  | { type: "error";      text: string };

export interface ChatPayload {
  message: string;
  session_id: string;
  mode: string;
  image_base64?: string;
  document_base64?: string;
  file_name?: string;
}

async function readSSE(res: Response, onEvent: (e: SSEEvent) => void): Promise<void> {
  if (!res.body) throw new Error("No response body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("data: ")) {
        try { onEvent(JSON.parse(line.slice(6)) as SSEEvent); } catch {}
      }
    }
  }
}

export async function streamChat(
  payload: ChatPayload,
  onEvent: (e: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${BASE}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  await readSSE(res, onEvent);
}

export async function streamUpload(
  file: File,
  sessionId: string,
  mode: string,
  onEvent: (e: SSEEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  form.append("session_id", sessionId);
  form.append("mode", mode);
  const res = await fetch(`${BASE}/upload/analyze`, {
    method: "POST",
    body: form,
    signal,
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  await readSSE(res, onEvent);
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target?.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function getMemory(): Promise<Record<string, string>> {
  const res = await fetch(`${BASE}/memory`);
  if (!res.ok) return {};
  return res.json();
}

export async function deleteMemoryKey(key: string): Promise<void> {
  await fetch(`${BASE}/memory/${encodeURIComponent(key)}`, { method: "DELETE" });
}

export async function clearSession(sessionId: string): Promise<void> {
  await fetch(`${BASE}/chat/session/${sessionId}`, { method: "DELETE" });
}

export async function checkHealth(): Promise<{ status: string; genai_ready: boolean }> {
  try {
    const res = await fetch(`${BASE}/health`);
    return res.json();
  } catch {
    return { status: "offline", genai_ready: false };
  }
}