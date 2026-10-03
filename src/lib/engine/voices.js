// src/lib/engine/voices.js
// Voice catalog + LOCKED voice assignment.
//
// Rule: the AI never picks a voice per scene. Every character gets ONE voice
// profile (voice + pitch + rate) when the Character Bible is built, it is saved
// on the character row, and every line that character speaks uses exactly that
// profile. The narrator gets its own fixed profile on the project.
//
// Edge TTS only has a few Urdu voices, so characters of the same gender are kept
// distinct with fixed pitch/rate offsets (still deterministic and locked).

export const EDGE_VOICES = {
  ur: {
    male: ["ur-PK-AsadNeural", "ur-IN-SalmanNeural"],
    female: ["ur-PK-UzmaNeural", "ur-IN-GulNeural"],
  },
  hi: {
    male: ["hi-IN-MadhurNeural"],
    female: ["hi-IN-SwaraNeural"],
  },
  en: {
    male: ["en-US-GuyNeural", "en-US-ChristopherNeural", "en-GB-RyanNeural", "en-US-EricNeural"],
    female: ["en-US-JennyNeural", "en-US-AriaNeural", "en-GB-SoniaNeural", "en-US-MichelleNeural"],
  },
};

// ElevenLabs (via fal) preset voice names. Multilingual v2 speaks the input language.
export const ELEVEN_VOICES = {
  male: ["Brian", "George", "Daniel", "Chris", "Eric", "Liam", "Bill", "Callum"],
  female: ["Sarah", "Laura", "Charlotte", "Alice", "Matilda", "Jessica", "Lily", "Aria"],
};

// Pitch/rate variations used to separate characters that share a base voice.
const VARIANTS = [
  { pitch: "+0Hz", rate: "+0%" },
  { pitch: "-6Hz", rate: "-4%" },
  { pitch: "+8Hz", rate: "+4%" },
  { pitch: "-12Hz", rate: "-8%" },
  { pitch: "+14Hz", rate: "+6%" },
];

const AGE_PITCH = { child: "+28Hz", teen: "+12Hz", adult: null, elder: "-10Hz" };
const AGE_RATE = { child: "+6%", teen: "+4%", adult: null, elder: "-10%" };

function normGender(g) {
  const s = String(g || "").toLowerCase();
  if (s.startsWith("f") || s.includes("woman") || s.includes("girl")) return "female";
  if (s.includes("animal") || s.includes("creature") || s.includes("none")) return "neutral";
  return "male";
}

function normAge(a) {
  const s = String(a || "").toLowerCase();
  if (s.includes("child") || s.includes("kid") || s.includes("baby")) return "child";
  if (s.includes("teen")) return "teen";
  if (s.includes("old") || s.includes("elder") || s.includes("senior")) return "elder";
  return "adult";
}

/**
 * Assign a locked voice profile to the narrator and every character.
 * Pure + deterministic: same input always gives the same voices.
 * @param {{provider:"edge"|"elevenlabs"|"mock", language:string, narratorGender?:string,
 *          characters:Array<{key:string, gender?:string, ageGroup?:string}>}} args
 * @returns {{narrator: object, byKey: Record<string, object>}}
 */
export function assignVoices({ provider = "edge", language = "ur", narratorGender = "male", characters = [] }) {
  const used = new Map(); // baseVoice -> times used
  const take = (gender) => {
    const g = gender === "neutral" ? "male" : gender;
    let pool;
    if (provider === "elevenlabs") pool = ELEVEN_VOICES[g];
    else if (provider === "mock") pool = [`mock-${g}-a`, `mock-${g}-b`];
    else pool = (EDGE_VOICES[language] || EDGE_VOICES.en)[g];
    // Least-used voice in the pool first, then catalog order.
    const sorted = [...pool].sort((a, b) => (used.get(a) || 0) - (used.get(b) || 0));
    const voice = sorted[0];
    const n = used.get(voice) || 0;
    used.set(voice, n + 1);
    return { voice, variant: VARIANTS[n % VARIANTS.length] };
  };

  const build = (gender, ageGroup) => {
    const { voice, variant } = take(normGender(gender));
    const age = normAge(ageGroup);
    const pitch = AGE_PITCH[age] || variant.pitch;
    const rate = AGE_RATE[age] || variant.rate;
    if (provider === "elevenlabs") {
      // ElevenLabs has distinct voices; use speed for age, no pitch control.
      const speed = age === "child" ? 1.08 : age === "elder" ? 0.9 : 1.0;
      return { provider, voice, speed, stability: 0.6, similarityBoost: 0.8, language };
    }
    return { provider, voice, pitch, rate, language };
  };

  const narrator = build(narratorGender, "adult");
  const byKey = {};
  for (const c of characters) byKey[c.key] = build(c.gender, c.ageGroup);
  return { narrator, byKey };
}

export function voiceLabel(profile) {
  if (!profile) return "";
  const extra = profile.pitch && profile.pitch !== "+0Hz" ? ` ${profile.pitch}` : "";
  return `${profile.voice}${extra}`;
}
