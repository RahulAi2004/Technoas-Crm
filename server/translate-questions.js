// Add a reliable English translation ONLY to genuinely Spanish questions (one-by-one, no batch misalignment).
import { chatText } from './ai.js'
import fs from 'fs'

const data = JSON.parse(fs.readFileSync('questions.json', 'utf8'))
const ES = /[ñ¿]|[áéíóú]|\b(que|qu[eé]|como|c[oó]mo|cuanto|cu[aá]nto|cu[aá]l|para|tienen|tiene|precio|gracias|hola|usted|podr[ií]a|ser[ií]a|d[oó]nde|est[aá]n|est[aá]|camis|l[aá]minas|env[ií]o|hacer|pedido|tama[ñn]o|colores|disculpe|quiero|necesito|cu[aá]ndo)\b/i

const targets = []
for (const g of data.intents) for (const q of g.questions) { delete q.en; if (ES.test(q.q)) targets.push(q) }
console.log('Spanish questions to translate:', targets.length)

let n = 0
for (const q of targets) {
  try { q.en = (await chatText('Translate this customer message to natural English. Reply with ONLY the translation — no quotes, no extra text.', q.q)).trim() }
  catch { q.en = '' }
  if (++n % 5 === 0) console.log(`  ${n}/${targets.length}`)
}
fs.writeFileSync('questions.json', JSON.stringify(data, null, 2))
console.log(`\n✓ DONE — ${targets.length} Spanish questions translated (one-by-one)`)
process.exit(0)
