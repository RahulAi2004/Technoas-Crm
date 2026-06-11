# Technocas CRM

A modern, browser-based CRM with a unified inbox, AI Supervisor, and Designer Jobs workflow. Built with **React + Vite + Tailwind CSS**.

## Live demo

Deployed on Vercel — link will appear here after first deployment.

## Demo credentials

| Field    | Value                |
| -------- | -------------------- |
| Email    | `info@technocas.com` |
| Password | `China@..@0077`      |

## Local development

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

## Production build

```bash
npm run build
npm run preview
```

`npm run build` outputs static files into `dist/`. Vercel detects Vite automatically and runs this on every push to `main`.

## Routes

| Path             | Page                                  | Auth required |
| ---------------- | ------------------------------------- | ------------- |
| `/`              | Login                                 | No            |
| `/dashboard`     | Inbox (chat + AI Supervisor)          | Yes           |
| `/customers`     | Customers list                        | Yes           |
| `/customer-360`  | Customer 360 detail (`?id=<slug>`)    | Yes           |

## Project structure

```
index.html                  Vite entry
vite.config.js              Vite config (React plugin)
tailwind.config.js          Tailwind theme (brand + ink colors)
postcss.config.js
package.json
vercel.json                 SPA rewrite for client-side routing
src/
  main.jsx                  React/Router/Toast bootstrap
  App.jsx                   Routes
  index.css                 Tailwind directives + base + layout CSS
  lib/auth.js               Session auth helpers
  data/
    customers.js            Customer list + helpers
    conversations.js        Conversation threads + status options
  components/
    RequireAuth.jsx         Protected-route wrapper
    ToastContext.jsx        Global toast provider + useToast()
    SidebarCrm.jsx          Shared CRM sidebar (Customers, Customer 360)
    TopBarUser.jsx          Avatar + logout block
    Dropdown.jsx            Reusable dropdown (data-attr based, matches CSS)
  pages/
    Login.jsx               Login page
    Dashboard.jsx           Inbox + AI Supervisor (largest page)
    Customers.jsx           Customers list table
    Customer360.jsx         Customer detail with 8 tabs
_legacy/                    Original HTML files (pre-React refactor)
```

## Features

- **Authentication** — login page with credential validation, `RequireAuth` route guard, logout button.
- **Unified inbox** — switch between conversations from a single list; per-conversation message history kept in state.
- **Messaging** — Reply or Internal Note, Enter-to-send, live timestamps, toast feedback.
- **AI Supervisor** with four tabs: Responses, Actions, Designer Jobs, Intent & Insights.
- **AI Recommended Reply** — Send / Edit / Ignore that actually pushes text into the chat.
- **AI Suggested Actions** — Send / Hold / Cancel buttons with toast feedback.
- **Designer Jobs** — add/delete rows, editable assignee + priority, live selected-count.
- **Lead status badge** — clickable dropdown with 6 statuses (New / Warm / Hot / Quote Sent / Won / Lost).
- **Live search** for conversations (top bar) and customers (Customers page).
- **Layout** — collapsible sidebar, collapsible filters panel, closable AI Supervisor, drag-to-resize gutters between panels; state persisted to `localStorage`.
- **Customer 360** — 8-tab layout with Overview, Orders, Notes, Payments fully built; Conversations/Artwork/Follow-Ups/Files stubbed.
- **Toast notifications** — single global system via React context.

## Notes

- The original static HTML files were preserved in `_legacy/` for reference.
- All UI styling is identical to the pre-React version — same Tailwind classes throughout.
