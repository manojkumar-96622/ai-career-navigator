// frontend/app/exerciseData.ts
export const EXERCISES: Record<string, any> = {
    HIGH: {
        exerciseName: "Box Breathing Technique",
        steps: [
            "Breathe in slowly for 4 counts.",
            "Hold your breath for 4 counts.",
            "Breathe out slowly for 4 counts.",
            "Hold for 4 counts.",
            "Repeat this 4 times."
        ],
        duration: "2",
        whyItHelps: "This will calm your nervous system within 2 minutes. Try it right now.",
        whenToUse: "When feeling highly distressed or panicked."
    },
    MODERATE: {
        exerciseName: "5-4-3-2-1 Grounding Technique",
        steps: [
            "Name 5 things you can see right now around you.",
            "Name 4 things you can physically feel like your feet on the floor.",
            "Name 3 things you can hear.",
            "Name 2 things you can smell.",
            "Name 1 thing you can taste."
        ],
        duration: "3",
        whyItHelps: "This brings you back to the present moment and out of anxious thoughts. Do this wherever you are right now.",
        whenToUse: "When feeling overwhelmed or anxious."
    },
    LOW: {
        exerciseName: "4-7-8 Breathing Technique",
        steps: [
            "Breathe in through your nose for 4 counts.",
            "Hold your breath for 7 counts.",
            "Breathe out through your mouth for 8 counts.",
            "Repeat 3 times."
        ],
        duration: "2",
        whyItHelps: "This is a natural relaxant for the nervous system.",
        whenToUse: "When needing to mildly destress or relax."
    }
};
