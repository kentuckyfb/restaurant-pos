# 🍽️ Restro — Modern Cloud POS System

A full-featured, offline-ready **Restaurant Point of Sale (POS)** system built with the **MERN Stack** (React 18, Node.js, Express, MongoDB Atlas). Designed for live restaurant operations, table management, order tracking, real-time kitchen syncing, stock deductions, shift reports, and digital receipts.

---

## 🚀 Features

* **⚡ Real-Time Live Sync:** Instant order updates across all screens using Server-Sent Events (SSE).
* **📴 Offline-Ready:** Continuous till operation during internet drops with local cache and automatic background sync.
* **🪑 Table & Floor Management:** Visual table layouts with status indicators (occupied, vacant, reserved).
* **📦 Recipe-Based Inventory:** Automatic stock depletion per dish portion, low-stock warnings, and stock movement logs.
* **🔐 Role-Based Access Control:** Role permissions for **Admin**, **Cashier**, and **Waiter** with single-use initial master setup.
* **🧾 Invoicing & Digital Receipts:** Thermal receipt printing layout, plus sharable customer receipt links with optional SMS and Email delivery.
* **📊 Shift & Daily Reports:** Track cash float, payment methods, sales summaries, and shift closing reports.
* **💾 Cloud Backup & Reset:** Full JSON database export/import and automated cloud clean-slate utilities.

---

## 🏗️ Architecture & Tech Stack

| Component | Technology | Description |
|---|---|---|
| **Frontend** | React 18, Vite, Tailwind CSS | High-performance SPA with responsive POS UI |
| **State & Cache** | Redux Toolkit, TanStack React Query | Client state management and optimistic caching |
| **Backend** | Node.js, Express.js | Secure REST API with SSE live event streams |
| **Database** | MongoDB Atlas (Mongoose) | Managed cloud document database |
| **Security** | JWT (HttpOnly cookies), Helmet, Rate Limiting | Production-grade security protections |

---

## 📁 Repository Structure

```
Restaurant_POS_System/
├── pos-backend/       # Node.js + Express backend API
│   ├── config/        # Database & environment configuration
│   ├── controllers/   # Business logic (orders, menu, inventory, shifts)
│   ├── models/        # Mongoose database schemas
│   ├── routes/        # Express REST API routes
│   └── scripts/       # Seeding and clean-slate database tools
└── pos-frontend/      # React + Vite frontend application
    ├── src/
    │   ├── components/# Modular POS UI components
    │   ├── offline/   # Offline caching & SSE sync engine
    │   └── pages/     # Cashier, Kitchen, Tables, Reports, Settings
    └── vercel.json    # Production SPA routing configuration
```

---

## ⚙️ Environment Configuration

### Backend (`pos-backend/.env`)
```env
PORT=8000
NODE_ENV=production
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.hluool3.mongodb.net/pos-db?retryWrites=true&w=majority
JWT_SECRET=your-random-64-char-secret-string
FRONTEND_URL=https://your-frontend.vercel.app
PUBLIC_APP_URL=https://your-frontend.vercel.app
TIMEZONE=Asia/Colombo
TRUST_PROXY=1
```

### Frontend (`pos-frontend/.env`)
```env
VITE_BACKEND_URL=https://your-backend.up.railway.app
```

---

## 🚢 Deployment

* **Backend:** Deploy to **[Railway](https://railway.app/)** (or Render) as a persistent Node container.
* **Frontend:** Deploy to **[Vercel](https://vercel.com/)** as a Vite SPA.
