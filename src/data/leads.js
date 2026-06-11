export const LEADS = [
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

export const PIPELINE_STAGES = [
  { key:'New Lead',          dot:'bg-violet-500',  est:6240,  count:10 },
  { key:'Quotation',         dot:'bg-amber-500',   est:8950,  count:12 },
  { key:'Artwork Approval',  dot:'bg-orange-500',  est:6100,  count:8  },
  { key:'Payment Pending',   dot:'bg-amber-600',   est:4320,  count:6  },
  { key:'Order Confirmed',   dot:'bg-emerald-500', est:12450, count:10 },
  { key:'Completed',         dot:'bg-slate-500',   est:9800,  count:14 },
]

export const SCORE_CLS = (s) =>
  s >= 80 ? 'text-emerald-600' :
  s >= 60 ? 'text-amber-600' : 'text-rose-600'
