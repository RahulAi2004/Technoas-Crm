// Deep customer intelligence summary — what they're into, what they buy most, are they wholesale,
// how to sell to them. Drop-in companion to build-profiles.js (same chatJSON(system, transcript) shape).
//
// Usage:
//   import { intelFromTranscript } from './customer-intel.js'
//   const intel = await intelFromTranscript(transcript)   // -> JSON object
//
import { chatJSON } from './ai.js'

export const CUSTOMER_INTEL_SYS = `You are a senior CRM analyst for Decoinks, a custom apparel print shop (DTF transfers, DTG, t-shirts, hoodies, hats, embroidery, gangsheets, neck labels).

You will be given the FULL chat transcript between a customer and our agents.
Read the WHOLE thing and produce a deep, decision-ready intelligence profile of this customer.

RULES — follow strictly:
- Ground EVERY claim in the transcript. Never invent facts, numbers, or quotes.
- "evidence" fields must be a SHORT VERBATIM quote from the CUSTOMER (not the agent).
- Judge interest by how often and how insistently the CUSTOMER raises a topic — not by what the agent pitched.
- Distinguish carefully:
    * brand_owner  = buys in bulk for THEIR OWN clothing line / website (not reselling our service)
    * reseller     = resells our transfers/prints on to their own customers
    * wholesaler   = buys large volume repeatedly at wholesale rates to distribute
    * business     = a company buying for staff/promo (not for resale)
    * event_group  = church/team/school/family event, usually one-off
    * individual   = personal, small, one-off
  Do NOT call someone wholesale just because they mentioned a big number once. Require repeated volume intent.
- If something was never discussed, use "" or an empty array — do not guess.
- Money: use the agreed/quoted USD number actually stated in the chat. Distinguish QUOTED vs actually PAID.
- Be blunt about risk. If they are shopping competitors, stalling on payment, or unhappy, say so.

Respond with ONLY a valid JSON object:
{
  "headline": string,                 // one line: who they are + where it stands. e.g. "Apparel brand owner, $1,875 order stuck unpaid, sampling DTF vs DTG"
  "summary": string,                  // 4-6 sentences: who they are, what they want, what happened, where it stands now
  "customerType": "brand_owner"|"reseller"|"wholesaler"|"business"|"event_group"|"individual"|"unknown",
  "interests": [                      // ranked, most-interested first, max 8
    { "topic": string,                // e.g. "DTF transfers", "samples", "trucker hats", "model photos for website"
      "strength": "high"|"medium"|"low",
      "evidence": string }            // short verbatim CUSTOMER quote
  ],
  "topProducts": [                    // what they actually ask for / order, most-discussed first, max 6
    { "product": string,
      "quantity": string,             // as stated, e.g. "100 hats (50 per colour)" ("" if never stated)
      "ordered": boolean }            // true only if actually ordered, not just discussed
  ],
  "buysMost": string,                 // one line: the product they order/ask for most
  "wholesale": {
    "isWholesale": boolean,           // true ONLY for repeated large-volume/resale intent
    "confidence": number,             // 0-100
    "typicalQuantity": string,        // "" if unknown
    "reasoning": string               // why yes/no, citing the chat
  },
  "priceSensitivity": "low"|"medium"|"high",
  "orderSummary": {
    "ordersPlaced": number,
    "quotedTotalUsd": number,         // 0 if none
    "paidUsd": number,                // ONLY what the chat shows as actually paid; 0 if unclear
    "paymentStatus": "paid"|"partial"|"pending"|"none",
    "paymentMethod": string           // "" if none
  },
  "objections": [string],             // real blockers they raised, verbatim-ish, max 5
  "risks": [string],                  // churn/payment/service risks, max 5. Include competitor shopping if present.
  "opportunities": [string],          // concrete upsell/next-order openings grounded in chat, max 5
  "howToSellToThem": [string],        // 3-5 tactical instructions for the agent, specific to THIS customer
  "communicationStyle": string,       // how they write/behave (short/blunt, polite, impatient, Spanish, emoji, etc.)
  "sentiment": "positive"|"neutral"|"negative",
  "churnRisk": "low"|"medium"|"high",
  "nextStep": string                  // the single most important next action ("" if nothing pending)
}`

export async function intelFromTranscript(transcript, opts = {}) {
  // transcript format: "Customer: ...\nAgent: ...\n" lines, newest context kept.
  return chatJSON(CUSTOMER_INTEL_SYS, transcript.slice(0, 14000), opts)
}

// Build a transcript string from message rows ({direction, body}) — keeps head + tail for long chats
export function toTranscript(rows, maxChars = 14000) {
  const lines = rows
    .filter((m) => (m.body || '').trim())
    .map((m) => `${m.direction === 'in' ? 'Customer' : 'Agent'}: ${m.body.replace(/\s+/g, ' ').trim()}`)
  const joined = lines.join('\n')
  if (joined.length <= maxChars) return joined
  const head = lines.slice(0, Math.floor(lines.length * 0.45)).join('\n').slice(0, Math.floor(maxChars * 0.5))
  const tail = lines.slice(-Math.floor(lines.length * 0.45)).join('\n').slice(-Math.floor(maxChars * 0.5))
  return `${head}\n\n...[middle of the conversation trimmed]...\n\n${tail}`
}
