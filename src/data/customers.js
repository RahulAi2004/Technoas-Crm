export const CUSTOMERS = [
  { id:'springfield-hs',   name:'Springfield High School', loc:'Springfield, IL',     company:'Springfield High School', tier:'Gold',   type:'School', orders:48, spend:28450, lastOrder:'May 2, 2024',  activityAgo:'2 hours ago', activityDaysAgo:'12 days ago', channel:'WhatsApp',  health:92, healthLabel:'Excellent', owner:'Mike Johnson',    role:'Account Manager', avatar:'bg-slate-900 text-white',   initials:'SH' },
  { id:'southland-church', name:'Southland Church',        loc:'Dallas, TX',          company:'Southland Church',        tier:'Gold',   type:'Church', orders:36, spend:21390, lastOrder:'Apr 28, 2024', activityAgo:'1 day ago',    activityDaysAgo:'16 days ago', channel:'Email',     health:88, healthLabel:'Excellent', owner:'Sarah Williams',  role:'Account Manager', avatar:'bg-violet-600 text-white',  initials:'SL' },
  { id:'urban-threads',    name:'Urban Threads Co.',       loc:'Los Angeles, CA',     company:'Urban Threads Co.',       tier:'Gold',   type:'Brand',  orders:26, spend:18760, lastOrder:'Apr 25, 2024', activityAgo:'2 days ago',   activityDaysAgo:'19 days ago', channel:'WhatsApp',  health:85, healthLabel:'Excellent', owner:'David Lee',       role:'Account Manager', avatar:'bg-emerald-700 text-white', initials:'UT' },
  { id:'northview-fb',     name:'Northview Football',      loc:'Northview, GA',       company:'Northview HS',            tier:'Silver', type:'School', orders:19, spend:12340, lastOrder:'Apr 18, 2024', activityAgo:'3 days ago',   activityDaysAgo:'26 days ago', channel:'Instagram', health:72, healthLabel:'Good',      owner:'Emily Davis',     role:'Account Manager', avatar:'bg-orange-500 text-white',  initials:'NF' },
  { id:'grind-fitness',    name:'Grind Fitness Apparel',   loc:'Miami, FL',           company:'Grind Fitness LLC',       tier:'Silver', type:'Brand',  orders:15, spend:9870,  lastOrder:'Apr 12, 2024', activityAgo:'5 days ago',   activityDaysAgo:'32 days ago', channel:'Email',     health:70, healthLabel:'Good',      owner:'Daniel Martinez', role:'Account Manager', avatar:'bg-amber-100 text-amber-700', initials:'G' },
  { id:'camp-victory',     name:'Camp Victory',            loc:'Austin, TX',          company:'Camp Victory',            tier:'Silver', type:'Church', orders:14, spend:8430,  lastOrder:'Apr 12, 2024', activityAgo:'6 days ago',   activityDaysAgo:'34 days ago', channel:'WhatsApp',  health:66, healthLabel:'Good',      owner:'Sarah Williams',  role:'Account Manager', avatar:'bg-yellow-600 text-white',  initials:'CV' },
  { id:'bold-streetwear',  name:'Bold Streetwear',         loc:'Chicago, IL',         company:'Bold Apparel Inc.',       tier:'Bronze', type:'Brand',  orders:8,  spend:5120,  lastOrder:'Mar 30, 2024', activityAgo:'7 days ago',   activityDaysAgo:'45 days ago', channel:'Email',     health:58, healthLabel:'At Risk',   owner:'David Lee',       role:'Account Manager', avatar:'bg-pink-500 text-white',    initials:'B' },
  { id:'riverside-pn',     name:'Riverside Panthers',      loc:'Riverside, CA',       company:'Riverside HS',            tier:'Bronze', type:'School', orders:7,  spend:4210,  lastOrder:'Mar 20, 2024', activityAgo:'9 days ago',   activityDaysAgo:'55 days ago', channel:'Facebook',  health:42, healthLabel:'At Risk',   owner:'Emily Davis',     role:'Account Manager', avatar:'bg-rose-600 text-white',    initials:'RP' },
  { id:'lakeside-acad',    name:'Lakeside Academy',        loc:'Boston, MA',          company:'Lakeside Academy',        tier:'Gold',   type:'School', orders:31, spend:19120, lastOrder:'Apr 19, 2024', activityAgo:'4 days ago',   activityDaysAgo:'25 days ago', channel:'WhatsApp',  health:84, healthLabel:'Excellent', owner:'Mike Johnson',    role:'Account Manager', avatar:'bg-sky-700 text-white',     initials:'LA' },
  { id:'eagle-scouts-42',  name:'Eagle Scouts Troop 42',   loc:'Denver, CO',          company:'Troop 42',                tier:'Silver', type:'Church', orders:12, spend:6890,  lastOrder:'Apr 5, 2024',  activityAgo:'8 days ago',   activityDaysAgo:'39 days ago', channel:'Email',     health:74, healthLabel:'Good',      owner:'Sarah Williams',  role:'Account Manager', avatar:'bg-indigo-600 text-white',  initials:'ES' },
  { id:'highland-boutique',name:'Highland Boutique',       loc:'Portland, OR',        company:'Highland Boutique',       tier:'Bronze', type:'Brand',  orders:6,  spend:3920,  lastOrder:'Mar 12, 2024', activityAgo:'12 days ago',  activityDaysAgo:'63 days ago', channel:'Instagram', health:48, healthLabel:'At Risk',   owner:'David Lee',       role:'Account Manager', avatar:'bg-teal-600 text-white',    initials:'HB' },
  { id:'westpark-fc',      name:'Westpark FC',             loc:'Phoenix, AZ',         company:'Westpark Football Club',  tier:'Gold',   type:'Sports', orders:22, spend:15600, lastOrder:'Apr 22, 2024', activityAgo:'3 days ago',   activityDaysAgo:'22 days ago', channel:'WhatsApp',  health:81, healthLabel:'Excellent', owner:'Daniel Martinez', role:'Account Manager', avatar:'bg-emerald-600 text-white', initials:'WP' },
]

export const CUSTOMER_HEADER_LOOKUP = Object.fromEntries(
  CUSTOMERS.map(c => [c.id, { name: c.name, initials: c.initials, avatar: c.avatar }])
)

export const tierClass = (tier) => ({
  Gold:   'bg-amber-100 text-amber-800',
  Silver: 'bg-slate-200 text-slate-700',
  Bronze: 'bg-orange-100 text-orange-700',
}[tier] || 'bg-slate-100 text-slate-600')

export const typeClass = (type) => ({
  School: 'bg-sky-100 text-sky-700',
  Church: 'bg-violet-100 text-violet-700',
  Brand:  'bg-rose-100 text-rose-700',
  Sports: 'bg-emerald-100 text-emerald-700',
}[type] || 'bg-slate-100 text-slate-700')

export const healthClass = (label) => ({
  Excellent: 'text-emerald-600 bg-emerald-50',
  Good:      'text-amber-700 bg-amber-50',
  'At Risk': 'text-rose-600 bg-rose-50',
}[label] || 'text-slate-600 bg-slate-100')

export const fmt$ = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
