// frontend/app/financePrompts.ts

export const EXTRACT_FINANCE_PROFILE_PROMPT = `
You are an expert financial crisis analyst for Indian citizens.
Extract the user's financial profile from the message below.

USER MESSAGE:
"{{USER_MESSAGE}}"

INSTRUCTIONS:
Extract the following information:
1. "monthlyIncomeBefore" - Monthly income before crisis (if mentioned)
2. "currentIncome" - Current monthly income (zero or reduced)
3. "monthlyExpenses" - Monthly expenses (rent, food, bills, EMI)
4. "dependents" - Number of family members dependent
5. "location" - State and city of residence
6. "loans" - Existing loans or EMIs and amounts
7. "employmentStatus" - Employment status (lost job, self employed, daily wage worker, farmer, student)
8. "casteCategory" - Caste category if mentioned (General, OBC, SC, ST) for scheme eligibility
9. "assets" - Any assets mentioned (land, vehicle, property, bank balance)

Output MUST be a valid JSON object. If any field is not mentioned, set it to "unknown" or make a reasonable assumption based on context.
`;

export const FIND_SCHEMES_PROMPT = `
You are the Senior Government Scheme Auditor. 
Your goal is to find guaranteed financial lifelines for the user. 
Think step-by-step: Cross-reference the user's Income, Caste, Location, and Employment Status against the rules.

EXTRACTED PROFILE:
{{PROFILE}}

### CRITICAL VERIFICATION LOGIC:
1. If income < 8L/yr -> Check EWS/PM-AY.
2. If daily wage/unorganized -> Check PM-SVANidhi / PM-Shram Yogi Maan-dhan.
3. If student -> Check Vidyasaarathi / State scholarships.
4. If farmer -> Rythu Bandhu (TS) / PM-Kisan.

### OUTPUT STRUCTURE (JSON ARRAY):
[
  {
    "schemeName": "Official Name",
    "benefit": "Detailed financial benefit amount",
    "exactEligibility": "Why user specifically qualifies",
    "documentsNeeded": ["Doc 1", "Doc 2"],
    "whereToApply": "Exact portal or office",
    "applicationLink": "https://official.gov.in/link",
    "timeToBenefit": "X weeks"
  }
]

Only return schemes where they have at least an 80% chance of approval. Be precise.
`;

export const BUILD_BUDGET_PROMPT = `
You are an expert emergency survival budget planner.
Based on the extracted financial profile below, create a realistic 30-day emergency survival budget for this Indian user.

EXTRACTED PROFILE:
{{PROFILE}}

INSTRUCTIONS:
The budget MUST follow this EXACT JSON structure:

{
  "incomeThisMonth": {
    "currentIncome": number,
    "emergencyFund": number,
    "expectedSchemeBenefit": number,
    "totalAvailable": number
  },
  "essentialExpenses": {
    "foodAndGroceries": number, // Calculate for family size (use 150 INR per person per day as base)
    "rentOrHousing": number,
    "utilities": number, // Electricity/Water
    "schoolFees": number,
    "medicines": number,
    "minimumEMI": number
  },
  "nonEssentialExpensesToCut": [
    { "item": string, "estimatedSavings": number }
  ],
  "summary": {
    "totalAvailable": number,
    "totalEssential": number,
    "remainingAmount": number,
    "survivalStatus": "Safe" | "Tight" | "Critical" // Critical if remainingAmount < 0
  },
  "moneySavingTips": [
    "5 specific, actionable tips to reduce expenses this month in India."
  ]
}

Output MUST be this exact JSON object. All currency values should be numbers.
`;

export const EMI_RESTRUCTURE_PROMPT = `
You are an expert banking negotiator helping an Indian citizen restructure their loans due to hardship.
Based on the extracted financial profile below, create a step-by-step EMI restructure plan.

EXTRACTED PROFILE:
{{PROFILE}}

INSTRUCTIONS:
Create a sequence of 5 steps to help the user request an EMI Moratorium or Loan Restructuring based on actual RBI guidelines.

The output MUST be this EXACT JSON structure:

{
  "step1Moratorium": "Explanation of RBI guidelines allowing banks to grant EMI moratorium (pause) for 3-6 months to customers facing genuine financial hardship, and how to request it.",
  "step2Restructuring": "Explanation that under RBI Resolution Framework banks can restructure loans by extending tenure or reducing EMI. Instructions on how to apply.",
  "step3BankVisitScript": "Exact word-for-word script of what to say to the Bank Manager. Include list of documents to carry (termination letter/income proof, last 3 months salary slips, bank statements, loan account number, written application).",
  "step4WrittenApplication": "A formal letter drafted to the Bank Manager requesting EMI moratorium. Use [PLACEHOLDERS] in square brackets for name/acc details. Mention financial hardship, reference RBI guidelines, request 3-month moratorium, and promise to resume payments.",
  "step5RbiOmbudsman": "Instructions to escalate to RBI Banking Ombudsman at https://cms.rbi.org.in if the bank refuses, explaining how to file the complaint online in 3 simple steps."
}

Output MUST be this exact JSON object. Use realistic, empathetic, and professional language.
`;
