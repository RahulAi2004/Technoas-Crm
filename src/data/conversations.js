export const CONVERSATIONS = {
  jc: {
    name: 'John Carter', initials: 'JC', avatarBg: 'bg-emerald-100 text-emerald-700',
    channel: 'WhatsApp', channelBg: 'bg-emerald-500',
    phone: '+1 (312) 555-0192', company: 'Springfield High School',
    status: 'Hot Lead', statusBg: 'bg-rose-50 text-rose-600 hover:bg-rose-100', statusIcon: '🔥',
    listPreview: 'Hi, we need 50 hoodies for our school event.',
    listTime: '10:24 AM', unread: 2,
    messages: [
      { dir:'in',  text:'Hi, we need 50 hoodies for our school event. Can you send me a quote?', time:'10:24 AM' },
      { dir:'out', text:"Hello John! Sure, I'd be happy to help. Could you please share the design and sizes needed?", time:'10:26 AM' },
      { dir:'in',  text:'Here is the design. We need sizes S–2XL.', time:'10:28 AM' },
      { dir:'out', text:"Thanks! I'll prepare the quote and send it shortly.", time:'10:30 AM' },
      { dir:'sys', text:'Conversation assigned to Mike Johnson', time:'10:35 AM' },
    ],
  },
  tm: {
    name: 'Tom Mark', initials: 'TM', avatarBg: 'bg-indigo-100 text-indigo-700',
    channel: 'Instagram', channelBg: 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600',
    phone: '@tom.mark', company: 'Mark Apparel Co.',
    status: 'Warm Lead', statusBg: 'bg-amber-50 text-amber-700 hover:bg-amber-100', statusIcon: '⚡',
    listPreview: 'Can you share the price list for t-shirts?', listTime: '10:15 AM', unread: 1,
    messages: [
      { dir:'in',  text:'Can you share the price list for t-shirts?', time:'10:15 AM' },
      { dir:'out', text:'Sure! What quantity are you looking at?', time:'10:17 AM' },
    ],
  },
  sl: {
    name: 'Steve Lee', initials: 'SL', avatarBg: 'bg-violet-100 text-violet-700',
    channel: 'Facebook', channelBg: 'bg-blue-600',
    phone: 'steve.lee.fb', company: 'Lee & Co. Marketing',
    status: 'New Lead', statusBg: 'bg-sky-50 text-sky-700 hover:bg-sky-100', statusIcon: '✨',
    listPreview: 'We need a design for our company anniversary.', listTime: '09:47 AM', unread: 0,
    messages: [
      { dir:'in',  text:'We need a design for our company anniversary.', time:'09:47 AM' },
      { dir:'in',  text:'Around 200 polo shirts, embroidered logo.', time:'09:48 AM' },
    ],
  },
  mg: {
    name: 'Mark Green', initials: 'MG', avatarBg: 'bg-emerald-100 text-emerald-700',
    channel: 'WhatsApp', channelBg: 'bg-emerald-500',
    phone: '+1 (646) 555-0144', company: 'GreenWave Studio',
    status: 'Quote Sent', statusBg: 'bg-violet-50 text-violet-700 hover:bg-violet-100', statusIcon: '📨',
    listPreview: 'When can we expect the delivery?', listTime: '09:30 AM', unread: 0,
    messages: [
      { dir:'out', text:'Quote attached. Total: $1,840 incl. delivery.', time:'09:25 AM' },
      { dir:'in',  text:'When can we expect the delivery?', time:'09:30 AM' },
    ],
  },
  hb: {
    name: 'Hanna Baker', initials: 'HB', avatarBg: 'bg-pink-100 text-pink-700',
    channel: 'Instagram', channelBg: 'bg-gradient-to-br from-amber-400 via-rose-500 to-fuchsia-600',
    phone: '@hanna.baker', company: 'Baker Boutique',
    status: 'New Lead', statusBg: 'bg-sky-50 text-sky-700 hover:bg-sky-100', statusIcon: '✨',
    listPreview: 'Do you have size chart?', listTime: 'Yesterday', unread: 0,
    messages: [{ dir:'in', text:'Do you have size chart?', time:'Yesterday 04:22 PM' }],
  },
  ps: {
    name: 'Paul Smith', initials: 'PS', avatarBg: 'bg-amber-100 text-amber-700',
    channel: 'Facebook', channelBg: 'bg-blue-600',
    phone: 'paul.smith.fb', company: 'PS Sports Club',
    status: 'Warm Lead', statusBg: 'bg-amber-50 text-amber-700 hover:bg-amber-100', statusIcon: '⚡',
    listPreview: "What's the minimum order quantity?", listTime: 'Yesterday', unread: 0,
    messages: [{ dir:'in', text:"What's the minimum order quantity?", time:'Yesterday 11:10 AM' }],
  },
  al: {
    name: 'Amanda Lewis', initials: 'AL', avatarBg: 'bg-rose-100 text-rose-700',
    channel: 'Email', channelBg: 'bg-slate-700',
    phone: 'amanda@lewistees.com', company: 'Lewis Tees',
    status: 'Won', statusBg: 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100', statusIcon: '🏆',
    listPreview: 'Thanks! Please send the final quote.', listTime: '2d ago', unread: 0,
    messages: [
      { dir:'out', text:'Final quote attached. Looking forward to working with you!', time:'2 days ago' },
      { dir:'in',  text:'Thanks! Please send the final quote.', time:'2 days ago' },
    ],
  },
}

export const STATUS_OPTIONS = [
  { label:'New Lead',   icon:'✨', cls:'bg-sky-50 text-sky-700 hover:bg-sky-100' },
  { label:'Warm Lead',  icon:'⚡', cls:'bg-amber-50 text-amber-700 hover:bg-amber-100' },
  { label:'Hot Lead',   icon:'🔥', cls:'bg-rose-50 text-rose-600 hover:bg-rose-100' },
  { label:'Quote Sent', icon:'📨', cls:'bg-violet-50 text-violet-700 hover:bg-violet-100' },
  { label:'Won',        icon:'🏆', cls:'bg-emerald-50 text-emerald-700 hover:bg-emerald-100' },
  { label:'Lost',       icon:'✗',  cls:'bg-slate-100 text-slate-600 hover:bg-slate-200' },
]
