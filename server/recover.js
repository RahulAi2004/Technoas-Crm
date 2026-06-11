// One-time recovery after data.json was truncated.
// Restores the admin user + CRM demo data. Does NOT add demo conversations
// (those were deleted on purpose); real Meta conversations re-sync from Graph
// API automatically once Meta is reconnected.
import bcrypt from 'bcryptjs'
import { resetDb, insert } from './db.js'

resetDb()

insert('users', {
  id: 1,
  email: 'info@technocas.com',
  password_hash: bcrypt.hashSync('China@..@0077', 10),
  name: 'Mike Johnson',
  role: 'admin',
})
console.log('✓ admin user')

const CUSTOMERS = [
  { id:'springfield-hs',   name:'Springfield High School', company:'Springfield High School', loc:'Springfield, IL',     type:'School', tier:'Gold',   orders:48, spend:28450, last_order:'May 2, 2024',  activity_ago:'2 hours ago', activity_days:'12 days ago', channel:'WhatsApp',  health:92, health_label:'Excellent', owner:'Mike Johnson',    role:'Account Manager', avatar:'bg-slate-900 text-white',   initials:'SH', phone:'+1 (217) 555-0198', email:'info@springfieldhs.edu' },
  { id:'southland-church', name:'Southland Church',        company:'Southland Church',        loc:'Dallas, TX',          type:'Church', tier:'Gold',   orders:36, spend:21390, last_order:'Apr 28, 2024', activity_ago:'1 day ago',   activity_days:'16 days ago', channel:'Email',     health:88, health_label:'Excellent', owner:'Sarah Williams',  role:'Account Manager', avatar:'bg-violet-600 text-white',  initials:'SL', phone:'+1 (214) 555-0142', email:'contact@southlandchurch.org' },
  { id:'urban-threads',    name:'Urban Threads Co.',       company:'Urban Threads Co.',       loc:'Los Angeles, CA',     type:'Brand',  tier:'Gold',   orders:26, spend:18760, last_order:'Apr 25, 2024', activity_ago:'2 days ago',  activity_days:'19 days ago', channel:'WhatsApp',  health:85, health_label:'Excellent', owner:'David Lee',       role:'Account Manager', avatar:'bg-emerald-700 text-white', initials:'UT', phone:'+1 (310) 555-0188', email:'sales@urbanthreads.co' },
  { id:'northview-fb',     name:'Northview Football',      company:'Northview HS',            loc:'Northview, GA',       type:'School', tier:'Silver', orders:19, spend:12340, last_order:'Apr 18, 2024', activity_ago:'3 days ago',  activity_days:'26 days ago', channel:'Instagram', health:72, health_label:'Good',      owner:'Emily Davis',     role:'Account Manager', avatar:'bg-orange-500 text-white',  initials:'NF', phone:'+1 (770) 555-0163', email:'coach@northviewhs.edu' },
  { id:'grind-fitness',    name:'Grind Fitness Apparel',   company:'Grind Fitness LLC',       loc:'Miami, FL',           type:'Brand',  tier:'Silver', orders:15, spend:9870,  last_order:'Apr 12, 2024', activity_ago:'5 days ago',  activity_days:'32 days ago', channel:'Email',     health:70, health_label:'Good',      owner:'Daniel Martinez', role:'Account Manager', avatar:'bg-amber-100 text-amber-700', initials:'G',  phone:'+1 (305) 555-0199', email:'team@grindfitness.com' },
  { id:'camp-victory',     name:'Camp Victory',            company:'Camp Victory',            loc:'Austin, TX',          type:'Church', tier:'Silver', orders:14, spend:8430,  last_order:'Apr 12, 2024', activity_ago:'6 days ago',  activity_days:'34 days ago', channel:'WhatsApp',  health:66, health_label:'Good',      owner:'Sarah Williams',  role:'Account Manager', avatar:'bg-yellow-600 text-white',  initials:'CV', phone:'+1 (512) 555-0177', email:'admin@campvictory.org' },
  { id:'bold-streetwear',  name:'Bold Streetwear',         company:'Bold Apparel Inc.',       loc:'Chicago, IL',         type:'Brand',  tier:'Bronze', orders:8,  spend:5120,  last_order:'Mar 30, 2024', activity_ago:'7 days ago',  activity_days:'45 days ago', channel:'Email',     health:58, health_label:'At Risk',   owner:'David Lee',       role:'Account Manager', avatar:'bg-pink-500 text-white',    initials:'B',  phone:'+1 (312) 555-0151', email:'hello@boldstreetwear.com' },
  { id:'riverside-pn',     name:'Riverside Panthers',      company:'Riverside HS',            loc:'Riverside, CA',       type:'School', tier:'Bronze', orders:7,  spend:4210,  last_order:'Mar 20, 2024', activity_ago:'9 days ago',  activity_days:'55 days ago', channel:'Facebook',  health:42, health_label:'At Risk',   owner:'Emily Davis',     role:'Account Manager', avatar:'bg-rose-600 text-white',    initials:'RP', phone:'+1 (951) 555-0190', email:'athletics@riversidehs.edu' },
  { id:'lakeside-acad',    name:'Lakeside Academy',        company:'Lakeside Academy',        loc:'Boston, MA',          type:'School', tier:'Gold',   orders:31, spend:19120, last_order:'Apr 19, 2024', activity_ago:'4 days ago',  activity_days:'25 days ago', channel:'WhatsApp',  health:84, health_label:'Excellent', owner:'Mike Johnson',    role:'Account Manager', avatar:'bg-sky-700 text-white',     initials:'LA', phone:'+1 (617) 555-0167', email:'admin@lakesideacademy.edu' },
  { id:'eagle-scouts-42',  name:'Eagle Scouts Troop 42',   company:'Troop 42',                loc:'Denver, CO',          type:'Church', tier:'Silver', orders:12, spend:6890,  last_order:'Apr 5, 2024',  activity_ago:'8 days ago',  activity_days:'39 days ago', channel:'Email',     health:74, health_label:'Good',      owner:'Sarah Williams',  role:'Account Manager', avatar:'bg-indigo-600 text-white',  initials:'ES', phone:'+1 (303) 555-0123', email:'troop42@scoutsdenver.org' },
  { id:'highland-boutique',name:'Highland Boutique',       company:'Highland Boutique',       loc:'Portland, OR',        type:'Brand',  tier:'Bronze', orders:6,  spend:3920,  last_order:'Mar 12, 2024', activity_ago:'12 days ago', activity_days:'63 days ago', channel:'Instagram', health:48, health_label:'At Risk',   owner:'David Lee',       role:'Account Manager', avatar:'bg-teal-600 text-white',    initials:'HB', phone:'+1 (503) 555-0144', email:'orders@highlandboutique.com' },
  { id:'westpark-fc',      name:'Westpark FC',             company:'Westpark Football Club',  loc:'Phoenix, AZ',         type:'Sports', tier:'Gold',   orders:22, spend:15600, last_order:'Apr 22, 2024', activity_ago:'3 days ago',  activity_days:'22 days ago', channel:'WhatsApp',  health:81, health_label:'Excellent', owner:'Daniel Martinez', role:'Account Manager', avatar:'bg-emerald-600 text-white', initials:'WP', phone:'+1 (602) 555-0156', email:'club@westparkfc.com' },
]
CUSTOMERS.forEach(c => insert('customers', c))
console.log(`✓ ${CUSTOMERS.length} customers`)

const LEADS = [
  { id:'jc',  name:'John Carter',     initials:'JC', av:'bg-emerald-500',  badge:'Hot',  company:'Springfield High School', source:'Facebook Ads', product:'DTF Transfers', units:'30 Artworks', pipeline:'New Lead',       pipelineCls:'text-violet-700',  score:85, status:'New',       statusCls:'bg-sky-50 text-sky-700',         value:1250,  agent:'Mike Johnson',    created:'May 12, 2024', createdTime:'10:24 AM' },
  { id:'tm',  name:'Tom Mark',        initials:'TM', av:'bg-indigo-500',   badge:null,    company:'Mark Basketball Club',    source:'Instagram',     product:'T-Shirts',       units:'20 Pieces',    pipeline:'Quotation',      pipelineCls:'text-amber-700',   score:72, status:'Contacted', statusCls:'bg-amber-50 text-amber-700',     value:2800,  agent:'Sarah Williams',  created:'May 11, 2024', createdTime:'09:15 AM' },
  { id:'nj',  name:'Nike Johnson',    initials:'NJ', av:'bg-rose-500',     badge:'Hot',  company:'Johnson Soccer Team',     source:'WhatsApp',      product:'Hoodies',        units:'15 Pieces',    pipeline:'Artwork Approval', pipelineCls:'text-orange-700', score:88, status:'In Progress', statusCls:'bg-orange-50 text-orange-700', value:2400,  agent:'Mike Johnson',    created:'May 10, 2024', createdTime:'03:22 PM' },
  { id:'rw',  name:'Robert Wilson',   initials:'RW', av:'bg-amber-500',    badge:null,    company:'Wilson Events',           source:'Referral',      product:'DTF Transfers', units:'50 Artworks',  pipeline:'Payment Pending',pipelineCls:'text-amber-600',   score:65, status:'Pending',   statusCls:'bg-amber-50 text-amber-700',     value:1680,  agent:'Sarah Williams',  created:'May 9, 2024',  createdTime:'11:05 AM' },
  { id:'sl',  name:'Steve Lee',       initials:'SL', av:'bg-violet-500',   badge:null,    company:'Lee Sports',              source:'Website',       product:'Jerseys',        units:'10 Pieces',    pipeline:'Order Confirmed',pipelineCls:'text-emerald-700', score:90, status:'Won',       statusCls:'bg-emerald-50 text-emerald-700', value:3450,  agent:'Mike Johnson',    created:'May 8, 2024',  createdTime:'02:40 PM' },
  { id:'mg',  name:'Mark Green',      initials:'MG', av:'bg-emerald-600',  badge:null,    company:'Green Road Truck',        source:'Google Ads',    product:'T-Shirts',       units:'30 Pieces',    pipeline:'Completed',      pipelineCls:'text-slate-600',   score:70, status:'Won',       statusCls:'bg-emerald-50 text-emerald-700', value:870,   agent:'Sarah Williams',  created:'May 7, 2024',  createdTime:'09:30 AM' },
  { id:'sm',  name:'Sarah Miller',    initials:'SM', av:'bg-pink-500',     badge:null,    company:'Miller Events',           source:'Instagram',     product:'Hoodies',        units:'25 Pieces',    pipeline:'Quotation',      pipelineCls:'text-amber-700',   score:60, status:'Contacted', statusCls:'bg-amber-50 text-amber-700',     value:875,   agent:'Mike Johnson',    created:'May 6, 2024',  createdTime:'12:10 PM' },
  { id:'lw',  name:'Lisa Wong',       initials:'LW', av:'bg-fuchsia-500',  badge:null,    company:'Wong Dance Academy',      source:'Referral',      product:'DTF Transfers', units:'12 Artworks',  pipeline:'Payment Pending',pipelineCls:'text-amber-600',   score:55, status:'Pending',   statusCls:'bg-amber-50 text-amber-700',     value:1320,  agent:'Sarah Williams',  created:'May 5, 2024',  createdTime:'04:55 PM' },
  { id:'bc',  name:'Brian Cooper',    initials:'BC', av:'bg-emerald-700',  badge:null,    company:'Cooper Construction',     source:'Cold Call',     product:'T-Shirts',       units:'50 Pieces',    pipeline:'New Lead',       pipelineCls:'text-violet-700',  score:40, status:'New',       statusCls:'bg-sky-50 text-sky-700',         value:1100,  agent:'Mike Johnson',    created:'May 4, 2024',  createdTime:'10:20 AM' },
  { id:'me',  name:'Michelle Evans',  initials:'ME', av:'bg-rose-600',     badge:null,    company:'Evans Marketing',         source:'Website',       product:'DTF Transfers', units:'25 Artworks',  pipeline:'Quotation',      pipelineCls:'text-amber-700',   score:75, status:'Contacted', statusCls:'bg-amber-50 text-amber-700',     value:1890,  agent:'Sarah Williams',  created:'May 3, 2024',  createdTime:'01:12 PM' },
]
LEADS.forEach(l => insert('leads', l))
console.log(`✓ ${LEADS.length} leads`)

const NOTES = [
  { id:'seed-note-1', customer_id:'springfield-hs', title:'Oversized back print preference', category:'Design',    body:'Customer prefers oversized back prints on all hoodies. Usually 12"–13" wide.', author:'Mike Johnson',   pinned:1, date:'Apr 28, 2024 · 10:25 AM' },
  { id:'seed-note-2', customer_id:'springfield-hs', title:'Prefers Zelle payment',           category:'Payment',   body:'Always prefers payment via Zelle.', author:'Sarah Williams', pinned:1, date:'Apr 25, 2024 · 02:15 PM' },
  { id:'seed-note-3', customer_id:'springfield-hs', title:'Rush delivery before event',      category:'Shipping',  body:'Needs all orders before major school events. Usually 2-3 weeks in advance.', author:'Mike Johnson',   pinned:0, date:'Apr 20, 2024 · 11:40 AM' },
]
NOTES.forEach(n => insert('notes', n))
console.log(`✓ ${NOTES.length} notes`)

const RECEIPTS = [
  { id:'seed-rct-1', receipt_no:'RCT-2024-1258', order_no:'#ORD-1042', customer:'John Smith',     customer_orders:1, date:'May 15, 2024', time:'10:30 AM', method:'Bank Transfer', method_icon:'🏦', amount:1250, status:'Paid', note:'Payment for', note2:'Eagles Logo - Full Front' },
  { id:'seed-rct-2', receipt_no:'RCT-2024-1257', order_no:'#ORD-1041', customer:'Sarah Williams', customer_orders:2, date:'May 14, 2024', time:'03:15 PM', method:'Credit Card',   method_icon:'💳', amount:980,  status:'Paid', note:'Payment for', note2:'Graduation 2025 Hoodie' },
  { id:'seed-rct-3', receipt_no:'RCT-2024-1256', order_no:'#ORD-1040', customer:'Michael Brown',  customer_orders:1, date:'May 13, 2024', time:'11:20 AM', method:'PayPal',        method_icon:'P',  amount:750,  status:'Paid', note:'Payment for', note2:'Football Jersey Front' },
  { id:'seed-rct-4', receipt_no:'RCT-2024-1255', order_no:'#ORD-1039', customer:'Emily Davis',    customer_orders:3, date:'May 12, 2024', time:'02:45 PM', method:'Bank Transfer', method_icon:'🏦', amount:2100, status:'Paid', note:'Bulk order payment', note2:'' },
  { id:'seed-rct-5', receipt_no:'RCT-2024-1254', order_no:'#ORD-1038', customer:'David Wilson',   customer_orders:1, date:'May 11, 2024', time:'09:10 AM', method:'Credit Card',   method_icon:'💳', amount:420,  status:'Paid', note:'Payment for', note2:'T-Shirt Mockup' },
  { id:'seed-rct-6', receipt_no:'RCT-2024-1253', order_no:'#ORD-1037', customer:'Lisa Anderson',  customer_orders:2, date:'May 10, 2024', time:'01:05 PM', method:'Debit Card',    method_icon:'💳', amount:1850, status:'Paid', note:'Payment for', note2:'Gang Sheet Order' },
  { id:'seed-rct-7', receipt_no:'RCT-2024-1252', order_no:'#ORD-1036', customer:'Chris Taylor',   customer_orders:1, date:'May 9, 2024',  time:'04:30 PM', method:'Bank Transfer', method_icon:'🏦', amount:625,  status:'Paid', note:'Rush order payment', note2:'' },
  { id:'seed-rct-8', receipt_no:'RCT-2024-1251', order_no:'#ORD-1035', customer:'Jessica Martinez', customer_orders:2, date:'May 8, 2024', time:'10:15 AM', method:'PayPal',      method_icon:'P',  amount:1320, status:'Paid', note:'Payment for', note2:'Hoodie Mockup' },
]
RECEIPTS.forEach(r => insert('receipts', r))
console.log(`✓ ${RECEIPTS.length} receipts`)

const ARTWORKS = [
  { id:'seed-art-1', name:'Eagles Logo - Full Front', type:'Artwork',    order_no:'#ORD-1042', customers:11, product:'T-Shirts, Hoodies', date:'May 10, 2024', fav:1, bg:'bg-slate-900' },
  { id:'seed-art-2', name:'Graduation 2025 Hoodie',   type:'Artwork',    order_no:'#ORD-1015', customers:6,  product:'Hoodies',           date:'May 10, 2024', fav:1, bg:'bg-slate-800' },
  { id:'seed-art-3', name:'Football Jersey Front',    type:'Artwork',    order_no:'#ORD-1008', customers:4,  product:'Jerseys',           date:'May 9, 2024',  fav:1, bg:'bg-slate-900' },
  { id:'seed-art-4', name:'Stronger Than Yesterday',  type:'Artwork',    order_no:'#ORD-0992', customers:3,  product:'T-Shirts',          date:'May 8, 2024',  fav:1, bg:'bg-slate-800' },
  { id:'seed-art-5', name:'Hoodie Mockup - Front',    type:'Mockup',     order_no:'#ORD-1042', customers:6,  product:'Hoodies',           date:'May 7, 2024',  fav:1, bg:'bg-slate-300' },
  { id:'seed-art-6', name:'T-Shirt Mockup - Back',    type:'Mockup',     order_no:'#ORD-1001', customers:7,  product:'T-Shirts',          date:'May 7, 2024',  fav:1, bg:'bg-slate-900' },
  { id:'seed-art-7', name:'Gang Sheet - Eagles Set',  type:'Gang Sheet', order_no:'#ORD-0985', customers:5,  product:'DTF Transfers',     date:'May 6, 2024',  fav:1, bg:'bg-amber-700' },
  { id:'seed-art-8', name:'Gang Sheet - Graduation',  type:'Gang Sheet', order_no:'#ORD-0978', customers:8,  product:'DTF Transfers',     date:'May 6, 2024',  fav:1, bg:'bg-slate-700' },
]
ARTWORKS.forEach(a => insert('artworks', a))
console.log(`✓ ${ARTWORKS.length} artworks`)

console.log('\n✅ Recovered. Reconnect Meta to re-sync real conversations.')
