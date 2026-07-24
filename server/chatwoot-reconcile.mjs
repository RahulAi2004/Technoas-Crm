// Chatwoot API se recent messages kheench kar shadow table ke webhook-gaps bharo.
// Aaj ke outage jaise waqt ke chhoote messages isse wapas aa jate hain. Re-run safe.
// Run:  node --env-file=.env chatwoot-reconcile.mjs [--hours 24]
import { cwReconcile, cwShadowStats } from './chatwoot.js'

const hi = process.argv.indexOf('--hours')
const hours = hi > -1 ? Number(process.argv[hi + 1]) || 24 : 24

console.log(`Chatwoot reconcile — pichhle ${hours} ghante...\n`)
const before = await cwShadowStats()
console.log('BEFORE shadow total:', before.total)
const r = await cwReconcile({ sinceHours: hours, maxPages: 60 })
console.log('\nRECONCILE:', JSON.stringify(r))
const after = await cwShadowStats()
console.log('AFTER shadow total :', after.total, '(+' + (Number(after.total) - Number(before.total)) + ' naye bhare)')
process.exit(0)
