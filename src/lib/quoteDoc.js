// ============================================================
// Quotation / Invoice document — Decoinks ke QuotePrintPage jaisa A4 layout, seedhe Lead
// Panel ki values se. Poora HTML self-contained hai; panel ise <iframe srcDoc> me dikhata
// hai, aur "Print / Save PDF" browser ke print dialog se PDF bana deta hai (koi server-side
// PDF engine ya popup window nahi).
// ============================================================

const CO = {
  name: 'Decoinks LLC',
  address: 'Suite 111, 1218 Magnolia Avenue',
  city: 'Corona, CA 92881, United States',
  email: 'info@decoinks.com',
  phone: '+1 (714) 790-1460',
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const num = (v) => { const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return Number.isNaN(n) ? 0 : n }
const SYM = { USD: '$', PKR: '₨', EUR: '€', GBP: '£', CAD: 'C$' }
const money = (n, cur) => `${SYM[cur] || '$'} ${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const fmtDate = (d) => {
  if (!d) return '—'
  const t = new Date(d)
  return isNaN(t.getTime()) ? '—' : t.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' })
}
const addrLines = (a) => !a ? [] : [a.contact, a.line1, a.line2, [a.city, a.state, a.zip].filter(Boolean).join(', '), a.country].filter(Boolean)
const rowAmount = (r) => Math.max(num(r.qty ?? r.quantity) * num(r.unit_price) - num(r.discount), 0)
const dash = (v) => (v == null || v === '') ? '—' : esc(v)

// ── Items table (row type ke hisaab se columns — panel ke sections jaise hi) ──
function itemsTable(rows, type, cur) {
  const cell = (v) => `<td>${v}</td>`
  if (type === 'dtf') {
    const body = rows.map((r, i) => `<tr>
      ${cell(i + 1)}${cell(dash(r.artwork_no || r.artwork_name))}
      ${cell(r.width && r.height ? `${esc(r.width)}" × ${esc(r.height)}"` : '—')}
      ${cell(num(r.qty ?? r.quantity))}${cell(money(num(r.unit_price), cur))}
      <td class="amt">${money(rowAmount(r), cur)}</td></tr>`).join('')
    return `<table class="items"><thead><tr><th style="width:34px">#</th><th class="left">Artwork</th><th>Size</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead><tbody>${body}</tbody></table>`
  }
  if (type === 'gangsheet') {
    const body = rows.map((r, i) => `<tr>
      ${cell(i + 1)}${cell(dash(r.sheet_size))}${cell(num(r.artwork_count))}
      ${cell(num(r.qty ?? r.quantity))}${cell(money(num(r.unit_price), cur))}
      <td class="amt">${money(rowAmount(r), cur)}</td></tr>`).join('')
    return `<table class="items"><thead><tr><th style="width:34px">#</th><th class="left">Gangsheet Size</th><th>Artworks</th><th>Sheets</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${body}</tbody></table>`
  }
  const body = rows.map((r, i) => {
    const name = r.item_name || r.description || 'Item'
    const meta = [r.brand || r.brand_style, r.style_code ? `Style ${r.style_code}` : '', r.sku].filter(Boolean).join(' · ')
    const print = [r.print_method, r.print_location].filter(Boolean).join(' · ')
    return `<tr>
      ${cell(i + 1)}${cell(dash(r.category))}
      <td class="left"><div class="p-name">${esc(name)}</div>${meta ? `<div class="p-meta">${esc(meta)}</div>` : ''}${print ? `<div class="p-meta">${esc(print)}</div>` : ''}</td>
      ${cell(dash(r.color))}${cell(dash(r.size))}
      ${cell(num(r.qty ?? r.quantity))}${cell(money(num(r.unit_price), cur))}
      <td class="amt">${money(rowAmount(r), cur)}</td></tr>`
  }).join('')
  return `<table class="items"><thead><tr><th style="width:34px">#</th><th>Category</th><th class="left">Product</th><th>Color</th><th>Size</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>${body}</tbody></table>`
}

/**
 * kind: 'quotation' | 'invoice'
 * vals: Lead Panel ke flat values, customerName: fallback naam
 */
export function buildDocHtml({ kind = 'quotation', vals = {}, customerName = '' }) {
  const isInv = kind === 'invoice'
  const isOrd = kind === 'order'
  const cur = (isInv ? vals.invoice_currency : isOrd ? (vals.order_currency || vals.invoice_currency) : vals.currency) || 'USD'
  // Sales order apni rows nahi rakhta — Invoice (ya Quote) ki rows hi uski lines hain.
  const pick = (a) => Array.isArray(a) && a.length ? a : null
  const rows = (isOrd ? (pick(vals.order_lines) || pick(vals.invoice_lines) || pick(vals.line_items))
    : isInv ? (pick(vals.invoice_lines) || pick(vals.line_items))
    : pick(vals.line_items)) || []
  const type = rows.find((r) => r.quote_type || r.order_type)?.quote_type || rows.find((r) => r.order_type)?.order_type || 'apparel'

  const itemsTotal = rows.reduce((s, r) => s + rowAmount(r), 0)
  const rush = (isInv || isOrd) ? 0 : num(vals.quote_rush_services)
  const shipping = num(isInv ? vals.invoice_shipping : isOrd ? 0 : vals.shipping_charges)
  const tax = num(isInv ? vals.invoice_tax : isOrd ? 0 : vals.quote_tax)
  const discount = num(isInv ? vals.invoice_discount : isOrd ? 0 : vals.discount)
  const subtotal = num(isInv ? vals.invoice_subtotal : isOrd ? vals.order_total : vals.subtotal) || itemsTotal
  const stored = num(isInv ? vals.invoice_total : isOrd ? vals.order_total : vals.grand_total)
  const total = stored || Math.max(subtotal + rush + shipping + tax - discount, 0)
  const paid = num(vals.amount_paid)
  const balance = num(vals.balance_due) || Math.max(total - paid, 0)

  const number = (isInv ? vals.invoice_number : isOrd ? vals.order_number : vals.quote_number) || ''
  const title = isInv ? 'INVOICE' : isOrd ? 'SALES ORDER' : 'QUOTATION'
  const custName = [vals.first_name, vals.last_name].filter(Boolean).join(' ') || vals.business_name || customerName || '—'
  const phone = vals.mobile_number || vals.company_phone || vals.whatsapp || ''
  const ship = addrLines(vals.shipping_address)
  const bill = addrLines(vals.billing_address)
  const terms = vals.payment_terms || 'Due on Receipt'
  const method = vals.payment_method || 'Bank Transfer'
  const notes = isInv ? vals.invoice_notes : isOrd ? (vals.order_instructions || vals.order_summary) : vals.quote_notes
  const summary = isInv || isOrd ? '' : vals.customer_requirement_summary
  const agent = vals.sales_agent || ''

  const totalQty = rows.reduce((s, r) => s + num(r.qty ?? r.quantity), 0)
  const artworks = type === 'gangsheet' ? rows.reduce((s, r) => s + num(r.artwork_count), 0) : rows.length

  const metaRows = isInv
    ? [['Invoice No', number || 'Not generated'], ['Invoice Date', fmtDate(vals.invoice_date)], ['Due Date', fmtDate(vals.invoice_due_date)]]
    : isOrd
      ? [['Order No', number || 'Not generated'], ['Order Date', fmtDate(vals.invoice_date || vals.quote_date)], ['Deadline', fmtDate(vals.order_deadline || vals.required_delivery_date)]]
      : [['Quote No', number || 'Not generated'], ['Quote Date', fmtDate(vals.quote_date)], ['Valid Until', fmtDate(vals.valid_until)]]
  if (agent) metaRows.push(['Sales Agent', agent])

  const statusChip = isInv ? (vals.invoice_status || 'Draft') : isOrd ? (vals.order_status || 'pending') : (vals.quote_status || 'Draft')

  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} ${esc(number)}</title><style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:Inter,ui-sans-serif,system-ui,'Segoe UI',Roboto,Arial,sans-serif;font-size:12px;color:#111827;background:#f1f5f9}
  .page{max-width:920px;margin:0 auto;padding:26px;background:#fff}
  @media print{body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{padding:0;max-width:100%}@page{margin:10mm;size:A4}}
  .hdr{display:flex;align-items:flex-start;gap:18px;padding-bottom:16px;margin-bottom:14px;border-bottom:2px solid #e5e7eb}
  .logo img{height:38px;width:auto;object-fit:contain;display:block;border-radius:4px}
  .logo .tag{font-size:8px;font-weight:800;letter-spacing:2.4px;color:#94a3b8;margin-top:4px;text-transform:uppercase}
  .hdr-title{flex:1;text-align:center;font-size:38px;font-weight:900;color:#0f1f3d;letter-spacing:3px}
  .hdr-meta table{border-collapse:collapse;margin-left:auto}
  .hdr-meta td{padding:2px 0;font-size:12px;white-space:nowrap}
  .hm-lbl{color:#64748b}.hm-sep{color:#cbd5e1;padding:0 7px}.hm-val{color:#1d4ed8;font-weight:800}
  .validity{font-size:10px;color:#94a3b8;text-align:right;margin-top:4px}
  .co-info{margin-bottom:14px;color:#374151;font-size:11px;line-height:1.7}
  .cards{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .card{border:1.5px solid #e5e7eb;border-radius:8px;padding:8px 10px;min-height:78px}
  .card .lbl{font-size:8.5px;font-weight:800;letter-spacing:1.1px;text-transform:uppercase;color:#94a3b8;margin-bottom:5px}
  .card .big{font-size:14px;font-weight:900;color:#1d4ed8;word-break:break-all}
  .card .name{font-size:12px;font-weight:800;color:#111827}
  .card .sub{font-size:10.5px;color:#6b7280;line-height:1.6}
  table.items{width:100%;border-collapse:collapse;margin-bottom:12px}
  table.items th{background:#0f1f3d;color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;padding:7px 6px;text-align:center}
  table.items th.left,table.items td.left{text-align:left}
  table.items td{border-bottom:1px solid #eef2f7;padding:7px 6px;text-align:center;font-size:11px;vertical-align:top}
  table.items tbody tr:nth-child(even){background:#f8fafc}
  td.amt{font-weight:800;color:#0f1f3d}
  .p-name{font-weight:700;color:#111827}.p-meta{font-size:9.5px;color:#94a3b8;margin-top:1px}
  .empty{border:1px dashed #cbd5e1;border-radius:8px;padding:18px;text-align:center;color:#94a3b8;margin-bottom:12px}
  .stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}
  .stat{border:1.5px solid #e5e7eb;border-radius:8px;padding:8px 10px}
  .stat .lbl{font-size:8.5px;font-weight:800;letter-spacing:1px;text-transform:uppercase;color:#94a3b8}
  .stat .val{font-size:15px;font-weight:900;color:#0f1f3d;margin-top:2px}
  .stat .val.blue{color:#1d4ed8}
  .bottom{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;margin-top:4px}
  .sec-title{font-size:9.5px;font-weight:800;letter-spacing:1.2px;text-transform:uppercase;color:#94a3b8;border-bottom:1.5px solid #e5e7eb;padding-bottom:5px;margin-bottom:8px}
  .pr{display:flex;justify-content:space-between;padding:4px 0;font-size:12px}
  .pr .val{font-weight:700}
  .pr.total{border-top:2px solid #0f1f3d;margin-top:6px;padding-top:8px;font-size:15px;font-weight:900;color:#0f1f3d}
  .neg{color:#dc2626}
  .note{white-space:pre-wrap;font-size:11px;color:#374151;line-height:1.65}
  .chip{display:inline-block;border-radius:999px;padding:2px 9px;font-size:9.5px;font-weight:800;background:#eef2ff;color:#4338ca;letter-spacing:.5px;text-transform:uppercase}
  .foot{margin-top:18px;padding-top:10px;border-top:1.5px solid #e5e7eb;text-align:center;font-size:10px;color:#94a3b8;line-height:1.7}
  </style></head><body><div class="page">

    <div class="hdr">
      <div class="logo"><img src="/logo.jpg" alt="Decoinks" onerror="this.style.display='none'"><div class="tag">Printshop OS</div></div>
      <div class="hdr-title">${title}</div>
      <div class="hdr-meta">
        <table><tbody>${metaRows.map(([l, v]) => `<tr><td class="hm-lbl">${l}</td><td class="hm-sep">:</td><td class="hm-val">${esc(v)}</td></tr>`).join('')}</tbody></table>
        <div class="validity">${isInv || isOrd ? `Status: ${esc(statusChip)}` : '( 7 days validity )'}</div>
      </div>
    </div>

    <div class="co-info">📍 ${esc(CO.address)}, ${esc(CO.city)}<br>✉️ ${esc(CO.email)} &nbsp;&nbsp; 📞 ${esc(CO.phone)}</div>

    <div class="cards">
      <div class="card"><div class="lbl">${isInv ? 'Invoice' : isOrd ? 'Order' : 'Quote'} No</div><div class="big">${esc(number || '—')}</div><div class="sub">${number ? 'Auto generated' : 'Not generated yet'}</div></div>
      <div class="card"><div class="lbl">Customer</div><div class="name">${esc(custName)}</div><div class="sub">${[vals.email, phone, vals.business_name].filter(Boolean).map(esc).join('<br>')}</div></div>
      <div class="card"><div class="lbl">Shipping Address</div><div class="sub">${ship.length ? ship.map(esc).join('<br>') : '—'}</div></div>
      <div class="card"><div class="lbl">Payment Terms</div><div class="name">${esc(terms)}</div><div class="sub" style="margin-top:6px"><b>Method:</b> ${esc(method)}</div></div>
    </div>

    ${rows.length ? itemsTable(rows, type, cur) : '<div class="empty">No items added yet</div>'}

    <div class="stats">
      <div class="stat"><div class="lbl">Total Items</div><div class="val">${rows.length}</div></div>
      <div class="stat"><div class="lbl">Total Artworks</div><div class="val">${artworks}</div></div>
      <div class="stat"><div class="lbl">Total Qty</div><div class="val">${totalQty} pcs</div></div>
      <div class="stat"><div class="lbl">Total Amount</div><div class="val blue">${money(total, cur)}</div></div>
    </div>

    <div class="bottom">
      <div>
        ${bill.length ? `<div class="sec-title">Billing Address</div><div class="note" style="margin-bottom:12px">${bill.map(esc).join('<br>')}</div>` : ''}
        ${summary ? `<div class="sec-title">Customer Requirement</div><div class="note" style="margin-bottom:12px">${esc(summary)}</div>` : ''}
        <div class="sec-title">Notes</div>
        <div class="note">${notes ? esc(notes) : '<span style="color:#cbd5e1">—</span>'}</div>
        <div style="margin-top:12px"><span class="chip">${esc(statusChip)}</span></div>
      </div>
      <div>
        <div class="sec-title">Pricing Summary</div>
        <div class="pr"><span>Items Total</span><span class="val">${money(itemsTotal, cur)}</span></div>
        ${rush > 0 ? `<div class="pr"><span>Rush Services</span><span class="val">${money(rush, cur)}</span></div>` : ''}
        ${shipping > 0 ? `<div class="pr"><span>${isInv ? 'Shipping' : 'Estimated Shipping'}</span><span class="val">${money(shipping, cur)}</span></div>` : ''}
        <div class="pr"><span>Subtotal</span><span class="val">${money(subtotal, cur)}</span></div>
        ${tax > 0 ? `<div class="pr"><span>Tax</span><span class="val">${money(tax, cur)}</span></div>` : ''}
        ${discount > 0 ? `<div class="pr"><span>Discount</span><span class="val neg">- ${money(discount, cur)}</span></div>` : ''}
        <div class="pr total"><span>Total</span><span class="val">${money(total, cur)}</span></div>
        ${isInv && paid > 0 ? `<div class="pr"><span>Amount Paid</span><span class="val">${money(paid, cur)}</span></div><div class="pr"><span>Balance Due</span><span class="val">${money(balance, cur)}</span></div>` : ''}
      </div>
    </div>

    <div class="foot">${esc(CO.name)} · ${esc(CO.email)} · ${esc(CO.phone)}<br>
      ${isInv ? 'Thank you for your business.' : isOrd ? 'Production starts once artwork is approved and payment terms are met.' : 'This quotation is valid until the date shown above. Prices may change after that.'}</div>
  </div></body></html>`
}
