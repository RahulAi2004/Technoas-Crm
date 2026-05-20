# Technocas CRM

A modern, browser-based CRM with a unified inbox, AI Supervisor, and Designer Jobs workflow. Built as a static front-end (HTML + Tailwind CDN + vanilla JS) — no build step required.

## Live demo

Deployed on Vercel — link will appear here after first deployment.

## Demo credentials

| Field    | Value                |
| -------- | -------------------- |
| Email    | `info@technocas.com` |
| Password | `China@..@0077`      |

## Features

- **Authentication** — login page with credential validation, session-based auth guard on the dashboard, logout button.
- **Unified inbox** — switch between conversations (WhatsApp / Instagram / Facebook / Email / Live Chat) from a single list.
- **Messaging** — send Reply or Internal Note messages, Enter-to-send, live timestamps, conversation-specific history.
- **AI Supervisor** with four tabs: Responses, Actions, Designer Jobs, Intent & Insights.
- **AI Recommended Reply** — Send / Edit / Ignore controls that actually push the suggestion into the chat.
- **AI Suggested Actions** — Send / Hold / Cancel buttons per action with toast feedback.
- **Designer Jobs** — task table with editable assignee + priority dropdowns, add/delete rows, live "tasks selected" counter.
- **Lead status** — clickable badge with 6 status options (New / Warm / Hot / Quote Sent / Won / Lost).
- **Live search** — filter conversations by name or preview text.
- **Layout** — collapsible sidebar, collapsible filters panel, closable AI Supervisor, drag-to-resize gutters between panels, all state persisted to `localStorage`.
- **Toast notifications** — feedback for every meaningful action.

## File layout

| File             | Purpose                              |
| ---------------- | ------------------------------------ |
| `index.html`     | Login page (default landing page)    |
| `dashboard.html` | Main CRM workspace (auth-guarded)    |
| `vercel.json`    | Vercel static-site config            |
| `.gitignore`     | Standard ignores                     |

## Local development

```bash
# from the project directory
python -m http.server 8000
# then open http://localhost:8000/
```

No build step, no dependencies. Tailwind is loaded via CDN.
