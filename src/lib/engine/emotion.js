// src/lib/engine/emotion.js
// Emotion for every spoken line. The script writer tags each line with one of
// EMOTIONS; this module turns that tag into:
//   - Edge TTS: prosody offsets (speed / pitch / volume) on top of the LOCKED
//     voice profile — the voice stays the same person, only the delivery changes.
//   - ElevenLabs v3: an audio tag such as "[excited]" at the start of the line.

export const EMOTIONS = ["neutral", "happy", "excited", "sad", "scared", "angry", "surprised", "whisper", "calm", "curious", "laughing"];

// Free-form words the LLM sometimes uses for a scene "mood" → our emotion set.
const SYNONYMS = {
  fun: "happy", joyful: "happy", cheerful: "happy", playful: "happy", warm: "happy", friendly: "happy", hopeful: "happy",
  thrilled: "excited", energetic: "excited", adventurous: "excited", action: "excited", exciting: "excited",
  sorrow: "sad", emotional: "sad", lonely: "sad", melancholy: "sad", crying: "sad",
  fear: "scared", afraid: "scared", tense: "scared", suspense: "scared", suspenseful: "scared", spooky: "scared", nervous: "scared", mysterious: "curious", dark: "scared",
  mad: "angry", furious: "angry", frustrated: "angry",
  shock: "surprised", shocked: "surprised", amazed: "surprised", wonder: "surprised",
  whispering: "whisper", secret: "whisper", quiet: "whisper",
  peaceful: "calm", gentle: "calm", relaxed: "calm", serene: "calm",
  wondering: "curious", inquisitive: "curious",
  funny: "laughing", laugh: "laughing", comedic: "laughing", hilarious: "laughing",
};

export function normalizeEmotion(e) {
  const s = String(e || "").toLowerCase().trim();
  if (EMOTIONS.includes(s)) return s;
  if (SYNONYMS[s]) return SYNONYMS[s];
  return "neutral";
}

// Offsets added to the voice's locked rate (%), pitch (Hz) and volume (%).
const EDGE_PROSODY = {
  neutral: { rate: 0, pitch: 0, volume: 0 },
  happy: { rate: 6, pitch: 8, volume: 5 },
  excited: { rate: 14, pitch: 16, volume: 15 },
  sad: { rate: -14, pitch: -10, volume: -15 },
  scared: { rate: 10, pitch: 18, volume: -5 },
  angry: { rate: 6, pitch: -4, volume: 25 },
  surprised: { rate: 8, pitch: 22, volume: 12 },
  whisper: { rate: -12, pitch: -6, volume: -45 },
  calm: { rate: -8, pitch: -4, volume: -5 },
  curious: { rate: -2, pitch: 10, volume: 0 },
  laughing: { rate: 10, pitch: 14, volume: 10 },
};

const num = (v) => {
  const n = parseFloat(String(v ?? "0"));
  return Number.isFinite(n) ? n : 0;
};
const signed = (n, unit) => `${n >= 0 ? "+" : ""}${Math.round(n)}${unit}`;

/** Edge prosody for a locked profile + an emotion. Values stay in safe ranges. */
export function edgeProsody(profile, emotion) {
  const d = EDGE_PROSODY[normalizeEmotion(emotion)];
  const rate = Math.max(-40, Math.min(40, num(profile.rate) + d.rate));
  const pitch = Math.max(-40, Math.min(50, num(profile.pitch) + d.pitch));
  const volume = Math.max(-60, Math.min(40, d.volume));
  return { rate: signed(rate, "%"), pitch: signed(pitch, "Hz"), volume: signed(volume, "%") };
}

const ELEVEN_TAGS = {
  neutral: "",
  happy: "[happy]",
  excited: "[excited]",
  sad: "[sad]",
  scared: "[nervous]",
  angry: "[angry]",
  surprised: "[surprised]",
  whisper: "[whispers]",
  calm: "[calm]",
  curious: "[curious]",
  laughing: "[laughs]",
};

/** Text for ElevenLabs v3 with its emotion audio tag in front. */
export function elevenText(text, emotion) {
  const tag = ELEVEN_TAGS[normalizeEmotion(emotion)];
  return tag ? `${tag} ${text}` : text;
}
