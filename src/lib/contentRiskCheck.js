// src/lib/contentRiskCheck.js
// Pre-Flight Content Check — scans a prompt/scene script for words and phrases
// that commonly trigger AI video model content-policy filters (based on real
// failures observed: cigarettes, police chases, weapons, etc.). This is a
// best-effort heuristic, NOT a guarantee — the underlying AI model's filter
// is the final authority and may still flag things not in this list, or may
// pass things that are flagged here. The goal is to catch the most common,
// avoidable failures before the customer spends time/credits generating.

const RISK_CATEGORIES = [
  {
    category: 'Smoking / substances',
    suggestion: 'Try replacing with a neutral action (e.g. holding a coffee cup, adjusting a watch).',
    terms: ['cigarette', 'cigar', 'smoking', 'vape', 'vaping', 'joint', 'marijuana', 'weed', 'cocaine', 'heroin', 'drugs', 'drug deal', 'syringe', 'needle'],
  },
  {
    category: 'Weapons / violence',
    suggestion: 'Describe the scene\'s emotion/energy without depicting weapons or physical harm.',
    terms: ['gun', 'rifle', 'pistol', 'shotgun', 'weapon', 'shooting', 'shoot him', 'shoot her', 'stab', 'stabbing', 'murder', 'kill', 'killing', 'blood', 'gore', 'torture', 'beating someone', 'punch him', 'punch her'],
  },
  {
    category: 'Crime / law evasion',
    suggestion: 'Reframe as general action/energy (e.g. "racing" instead of "police chase") without depicting law-breaking or evading police.',
    terms: ['police chase', 'car chase', 'high-speed chase', 'robbery', 'heist', 'robbing', 'arrested', 'handcuffs', 'evading police', 'smuggling'],
  },
  {
    category: 'Adult / sexual content',
    suggestion: 'Keep descriptions non-sexual and fully clothed.',
    terms: ['nude', 'naked', 'topless', 'explicit', 'sexual', 'nsfw'],
  },
  {
    category: 'Extremism / hate',
    suggestion: 'Remove references to extremist groups, symbols, or hate speech.',
    terms: ['terrorist', 'nazi', 'swastika', 'extremist', 'hate speech'],
  },
  {
    category: 'Real brands / trademarks',
    suggestion: 'Use a generic/fictional name instead — real brand names and logos are often rejected or can cause legal issues.',
    terms: ['nike', 'adidas', 'coca-cola', 'coca cola', 'pepsi', "mcdonald's", 'mcdonalds', 'disney', 'marvel', 'netflix', 'starbucks', 'apple logo', 'iphone', 'tesla logo'],
  },
]

// Builds one regex per term with word boundaries, case-insensitive.
const COMPILED = RISK_CATEGORIES.flatMap((cat) =>
  cat.terms.map((term) => ({
    category: cat.category,
    suggestion: cat.suggestion,
    term,
    regex: new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'),
  }))
)

/**
 * Scans the given text and returns an array of matches:
 * [{ term, category, suggestion }, ...] — deduplicated by term.
 */
export function scanForRiskyContent(text) {
  if (!text || !text.trim()) return []
  const found = []
  const seen = new Set()
  for (const entry of COMPILED) {
    if (entry.regex.test(text) && !seen.has(entry.term)) {
      seen.add(entry.term)
      found.push({ term: entry.term, category: entry.category, suggestion: entry.suggestion })
    }
  }
  return found
}
