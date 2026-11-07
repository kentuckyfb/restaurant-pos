# 🍽️ Restro POS — Backend API

Node.js and Express REST API for the Restro Restaurant POS System, backed by MongoDB Atlas with Server-Sent Events (SSE) for live order updates.

---

## 🛠️ Environment Variables (Railway / Production)

| Variable | Required | Description | Example |
|---|---|---|---|
| `MONGODB_URI` | **Yes** | MongoDB Atlas SRV connection string | `mongodb+srv://user:pass@cluster.mongodb.net/pos-db?retryWrites=true&w=majority` |
| `JWT_SECRET` | **Yes** | Secret string (32+ characters) for signing login tokens | `d149acad60f3fe395c8426513f961077b...` |
| `FRONTEND_URL` | **Yes** | Live frontend address allowed by CORS | `https://pos-frontend.vercel.app` |
| `PUBLIC_APP_URL` | **Yes** | Frontend address used in public receipt links | `https://pos-frontend.vercel.app` |
| `NODE_ENV` | **Yes** | Set to `production` when hosted | `production` |
| `TRUST_PROXY` | **Yes** | Set to `1` behind Railway/Render proxies | `1` |
| `TIMEZONE` | No | Timezone for shift grouping and reports | `Asia/Colombo` (default) |
| `PORT` | No | Port to listen on (Railway injects this) | `8000` |

### Optional Receipt Integrations
* **Email (SMTP):** `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
* **SMS (Notify.lk):** `NOTIFY_USER_ID`, `NOTIFY_API_KEY`, `NOTIFY_SENDER_ID`

---

## 💻 Available Scripts

* `npm run dev`: Start the development server with nodemon.
* `npm start`: Start the production server (`node app.js`).
* `npm run seed`: Populate sample categories, dishes, inventory, and tables into an empty DB.
* `npm run clean-slate`: Completely wipe all collections in the connected database back to zero.
