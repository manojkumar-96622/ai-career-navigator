import { callGemini, extractJSON } from "./careerUtils";

export type JobMatch = {
  jobTitle: string;
  applyWhere: string;
  matchReason: string;
  tip: string;
};

export type RecruiterEmail = {
  emailNumber: 1 | 2 | 3;
  tone: string;
  subject: string;
  body: string;
};

export type TrackerRow = {
  jobTitle: string;
  company: string;
  appliedDate: string;
  status: string;
  resumeSent: string;
  followUpDate: string;
  notes: string;
};

export type CareerRescueResult = {
  resume: string | null;
  jobs: JobMatch[] | null;
  emails: RecruiterEmail[] | null;
  tracker: TrackerRow[] | null;
  errors: Partial<Record<keyof Omit<CareerRescueResult, "errors">, string>>;
};

export async function runCareerAgent(
  userMessage: string,
  onProgress?: (phase: keyof Omit<CareerRescueResult, "errors">, data: any) => void
): Promise<CareerRescueResult> {

  const result: CareerRescueResult = {
    resume: null,
    jobs: null,
    emails: null,
    tracker: null,
    errors: {}
  };

  const baseContext = `
USER MESSAGE:
"${userMessage}"
  `;

  const prompt = `
You are a Top-Tier Career Recovery Consultant. Use advanced career coaching techniques to rescue the user.
Your output must be authoritative, premium, and extremely professional.

### PROFESSIONAL GUIDELINES:
- RESUME: Use a clean, modern executive format. Focus on accomplishments with metrics (e.g., "Increased efficiency by 20%").
- EMAILS: Use high-conversion subject lines. The body must be concise, punchy, and demonstrate value.
- JOBS: Suggest roles that are slightly higher than their current one to show growth.

### EXAMPLE HIGH-QUALITY OUTPUT (FOR STRUCTURE):
"resume": "# [NAME]\n## Professional Summary\nResults-driven professional with 5+ years of experience in [Field]...\n## Key Skills\n- Strategic Planning | Financial Modeling | Team Leadership\n## Experience\n**[Title]** | [Company]\n- Led a cross-functional team of 10 to deliver...",

"emails": [
  {
    "emailNumber": 1,
    "tone": "direct",
    "subject": "Strategic [Role] Opportunity - [Name] Application",
    "body": "Hi [Hiring Manager Name],\n\nI’ve followed [Company]’s growth in [Industry] and noticed you are expanding your [Department] team. With my background in [Skill], I am confident I can contribute to your Q4 goals..."
  }
]

### MISSION:
Generate a comprehensive career rescue plan based on the user's crisis.
You MUST return your ENTIRE response as ONE valid JSON object. 
DO NOT wrap the response in markdown code blocks. Just return raw JSON.

{
  "resume": "A high-end Markdown resume based on the profile provided.",
  "jobs": [...],
  "emails": [...],
  "tracker": [...]
}

USER MESSAGE:
"${userMessage}"
`;

  try {
    const rawResponse = await callGemini(prompt, 6); // Up to 6 retries just in case
    const parsed = extractJSON(rawResponse);

    // Map Resume
    if (parsed.resume) {
      result.resume = parsed.resume;
      onProgress?.("resume", result.resume);
    } else {
      result.errors.resume = "Resume missing from JSON response";
    }

    // Map Jobs
    if (parsed.jobs && Array.isArray(parsed.jobs)) {
      result.jobs = parsed.jobs;
      onProgress?.("jobs", result.jobs);
    } else {
      result.errors.jobs = "Jobs missing from JSON response";
    }

    // Map Emails
    if (parsed.emails && Array.isArray(parsed.emails)) {
      result.emails = parsed.emails;
      onProgress?.("emails", result.emails);
    } else {
      result.errors.emails = "Emails missing from JSON response";
    }

    // Map Tracker
    if (parsed.tracker && Array.isArray(parsed.tracker)) {
      result.tracker = parsed.tracker;
      onProgress?.("tracker", result.tracker);
    } else {
      result.errors.tracker = "Tracker missing from JSON response";
    }

  } catch (e: any) {
    result.errors.resume = `Failed to generate plan: ${e.message} `;
    result.errors.jobs = `Failed to generate plan: ${e.message} `;
    result.errors.emails = `Failed to generate plan: ${e.message} `;
    result.errors.tracker = `Failed to generate plan: ${e.message} `;
  }

  return result;
}
