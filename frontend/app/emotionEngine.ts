export async function analyzeEmotion(messageText: string, backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8080"): Promise<string> {
  if (!messageText || messageText.trim() === "") return "CALM";

  const lowerText = messageText.toLowerCase();

  // Local static keyword analysis
  const panicWords = ["panic", "emergency", "urgent", "help", "die", "dead", "crisis"];
  const angryWords = ["hate", "stupid", "idiot", "angry", "mad", "furious", "terrible"];
  const sadWords = ["sad", "depressed", "cry", "lonely", "hopeless", "miserable"];
  const exhaustedWords = ["tired", "exhausted", "sleepy", "drained", "burnt out"];
  const excitedWords = ["amazing", "awesome", "excited", "wow", "great", "love"];
  const fearWords = ["scared", "terrified", "afraid", "fear", "anxious"];
  const nervousWords = ["nervous", "worried", "stressed", "unsure", "confused"];

  if (panicWords.some(w => lowerText.includes(w))) return "FEAR";
  if (angryWords.some(w => lowerText.includes(w))) return "ANGRY";
  if (sadWords.some(w => lowerText.includes(w))) return "SAD";
  if (exhaustedWords.some(w => lowerText.includes(w))) return "EXHAUSTED";
  if (excitedWords.some(w => lowerText.includes(w))) return "EXCITED";
  if (fearWords.some(w => lowerText.includes(w))) return "FEAR";
  if (nervousWords.some(w => lowerText.includes(w))) return "NERVOUS";

  // Exclamation points rule
  if ((messageText.match(/!/g) || []).length > 2) return "EXCITED";

  // All caps rule (if message is > 5 chars and 80% uppercase)
  const letters = messageText.replace(/[^a-zA-Z]/g, '');
  if (letters.length > 5) {
    const upperCount = (letters.match(/[A-Z]/g) || []).length;
    if (upperCount / letters.length > 0.8) return "ANGRY";
  }

  return "CALM";
}

