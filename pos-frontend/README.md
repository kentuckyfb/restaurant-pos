# 🍽️ Restro POS — Frontend Client

React 18 Single Page Application built with Vite, Tailwind CSS, Redux Toolkit, and TanStack React Query for restaurant floor, kitchen, and till operations.

---

## 🛠️ Environment Variables (Vercel / Production)

| Variable | Required | Description | Example |
|---|---|---|---|
| `VITE_BACKEND_URL` | **Yes** | Full URL of the live backend API | `https://your-backend.up.railway.app` |

---

## 🚀 Features

* **Instant Till & Order Taking:** Fast item search, category filters, and table assignment.
* **Live Sync via SSE:** Screen updates automatically when other devices create or modify orders.
* **Offline-Ready:** Works during internet drops using browser storage and syncs once reconnected.
* **Receipt & Invoice Printing:** Formatted thermal receipts and customer links.
* **First-Time Setup Flow:** Automatically detects fresh database installs and prompts for admin account creation.

---

## 💻 Available Scripts

* `npm run dev`: Start local Vite development server at `http://localhost:5173`.
* `npm run build`: Build production assets to `dist/`.
* `npm run preview`: Preview production build locally.
