// src/lib/adTemplates.js
// UGC Ad Template Library — pre-built scene structures for proven ad formats.
// Each template has a set of fields (customer fills these in) and a scene
// array with {{PLACEHOLDER}} tokens that get replaced with the customer's
// answers to build the final [SCENE N] script automatically.

export const AD_TEMPLATES = [
  {
    id: 'problem-agitate-solve',
    name: 'Problem → Agitate → Solve',
    description: 'Classic UGC ad structure — show the pain, make it worse, then reveal the fix. Best for software, tools, and services.',
    fields: [
      { key: 'PAIN_POINT', label: 'What problem does your product solve?', placeholder: 'e.g. spending hours editing videos with 4 different tools' },
      { key: 'PRODUCT', label: 'Product/tool — name & short description', placeholder: 'e.g. Vidro, an AI video generator' },
      { key: 'BENEFIT', label: 'Main benefit/result the customer gets', placeholder: 'e.g. a finished video from one prompt' },
    ],
    scenes: [
      `A frustrated person dealing with {{PAIN_POINT}}, overwhelmed expression, realistic home or office setting, handheld camera feel, soft natural lighting`,
      `Fast montage of the struggle with {{PAIN_POINT}} intensifying, stressful and inefficient pacing, quick cuts, visible frustration`,
      `The person discovers and opens {{PRODUCT}}, mood shifts calmer and more focused, clean simple interaction, relieved expression`,
      `{{BENEFIT}} shown clearly working, satisfied and impressed expression, smooth confident pacing`,
      `Final confident hero shot, person gestures toward {{PRODUCT}}, relieved and satisfied expression, direct eye contact with camera`,
    ],
  },
  {
    id: 'before-after',
    name: 'Before → After',
    description: 'Visual transformation format — strong for physical products, fitness, beauty, home/space improvements.',
    fields: [
      { key: 'PAIN_POINT', label: 'What does the "before" state look like?', placeholder: 'e.g. a messy cluttered room' },
      { key: 'PRODUCT', label: 'Product/tool — name & short description', placeholder: 'e.g. a storage organizer system' },
      { key: 'BENEFIT', label: 'What does the "after" result look like?', placeholder: 'e.g. a clean organized space' },
    ],
    scenes: [
      `Wide shot showing the "before" state clearly: {{PAIN_POINT}}, realistic everyday setting, neutral lighting, slightly messy energy`,
      `Close-up detail shots emphasizing the frustration of {{PAIN_POINT}}, person sighing or shaking head, handheld camera`,
      `The person introduces and starts using {{PRODUCT}}, focused determined expression, clean simple demonstration`,
      `Transformation moment revealing the "after" result: {{BENEFIT}}, bright satisfying reveal, smooth camera movement`,
      `Final wide shot of the completed "after" state, person smiling proudly next to {{BENEFIT}}, warm confident lighting`,
    ],
  },
  {
    id: 'testimonial',
    name: 'Talking Testimonial',
    description: 'Person speaks directly to camera about their experience — builds trust fast. Best for services, subscriptions, courses.',
    fields: [
      { key: 'PAIN_POINT', label: 'What struggle is the person talking about?', placeholder: 'e.g. never having time to edit content' },
      { key: 'PRODUCT', label: 'Product/tool — name & short description', placeholder: 'e.g. Vidro' },
      { key: 'BENEFIT', label: 'What result are they sharing?', placeholder: 'e.g. saved hours every week' },
    ],
    scenes: [
      `A person sits casually in a home setting, talking directly to camera, warm natural lighting, explaining their struggle with {{PAIN_POINT}}, genuine relatable expression`,
      `The same person continues talking to camera, gesturing naturally, explaining why they decided to try {{PRODUCT}}, curious open expression`,
      `Cutaway shot showing {{PRODUCT}} in use, clean simple demonstration, no readable tiny text, focused calm mood`,
      `The person back on camera, enthusiastic and animated, sharing that they got {{BENEFIT}}, genuine excited expression`,
      `The person smiling warmly at the camera, relaxed satisfied sign-off expression, natural home lighting, casual confident close`,
    ],
  },
  {
    id: 'unboxing',
    name: 'Unboxing / First Try',
    description: 'Curiosity-driven format following a first impression — strong for physical products and apps/tools alike.',
    fields: [
      { key: 'PRODUCT', label: 'Product/tool — name & short description', placeholder: 'e.g. a new skincare set' },
      { key: 'PAIN_POINT', label: 'What was the person skeptical or curious about?', placeholder: 'e.g. whether it actually works' },
      { key: 'BENEFIT', label: 'What was the positive result/reaction?', placeholder: 'e.g. visibly smoother skin in one use' },
    ],
    scenes: [
      `A person receiving or opening {{PRODUCT}} for the first time, excited curious expression, realistic home setting, natural lighting`,
      `Close-up detail shots of {{PRODUCT}}, hands examining it carefully, curious skeptical expression thinking about {{PAIN_POINT}}`,
      `The person trying {{PRODUCT}} for the first time, focused engaged expression, clean simple demonstration`,
      `Reaction shot showing genuine surprise and satisfaction as they notice {{BENEFIT}}, authentic delighted expression`,
      `Final confident shot, person holding {{PRODUCT}} and smiling at camera, satisfied recommending expression, warm natural lighting`,
    ],
  },
]
