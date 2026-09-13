# Deployment Guide: Kaarthi Lifts Real-Time Platform

This guide outlines how to push your code to **GitHub**, set up your free **Appwrite** backend, acquire your domain **`kaarthilifts1.in`**, deploy the server with **WebSockets & Appwrite**, and connect your custom domain.

---

## Step 0: Set Up Appwrite (Free Backend)

1. Sign in at [cloud.appwrite.io](https://cloud.appwrite.io) and create (or open) your organization/project.
2. In your project, go to **Overview** and copy the **Project ID** and the **API Endpoint** (e.g. `https://cloud.appwrite.io/v1`, or a region-specific URL like `https://fra.cloud.appwrite.io/v1` — use whichever is shown for your project).
3. Go to **Settings → API Keys → Create API Key**. Give it a name (e.g. `server-key`) and grant it the `databases.read` and `databases.write` scopes (or "Databases" full access). Copy the generated key — you only see it once.
4. Copy `.env.example` to `.env` and fill in:
   ```
   APPWRITE_ENDPOINT=https://cloud.appwrite.io/v1
   APPWRITE_PROJECT_ID=<your project id>
   APPWRITE_API_KEY=<your api key>
   APPWRITE_DATABASE_ID=kaarthi_lifts_db
   ```
5. Install dependencies and run the one-time setup script, which creates the database, tables, columns, indexes, and default settings for you:
   ```bash
   npm install
   npm run setup:appwrite
   ```
   This is safe to re-run any time — it skips anything that already exists.
6. Start the app locally to confirm it connects: `npm start`, then open `http://localhost:3000/admin` and log in with PIN `kaarthi2026` (change this later from the admin settings panel).

---

## Step 1: Push Code to GitHub

Your project is already initialized with Git and committed locally.

1. Go to [github.com/new](https://github.com/new) and create a new repository:
   - **Repository name**: `kaarthi-lifts`
   - **Visibility**: Public or Private
   - Do **NOT** initialize with README or .gitignore (we already have them)
2. Run these commands in your project terminal:
   ```bash
   git remote add origin https://github.com/<YOUR_USERNAME>/kaarthi-lifts.git
   git branch -M main
   git push -u origin main
   ```

---

## Step 2: Acquire the Domain (`kaarthilifts1.in`)

Currently, both `kaarthilifts1.in` and `kaarthilifts.in` are available for registration:

- **Recommended Registrars**:
  - [Hostinger India](https://www.hostinger.in/domain-checker) (typically ₹399–₹499/year for `.in`)
  - [GoDaddy India](https://www.godaddy.com/en-in)
  - [Namecheap](https://www.namecheap.com)
- **Tip**: You can register `kaarthilifts1.in` (or `kaarthilifts.in` if you prefer the cleaner name without the "1").

---

## Step 3: Deploy Fullstack Server (Render / Railway)

Because this app uses **WebSockets (`socket.io`)** and stores data in **Appwrite** (not on local disk), it needs a Node.js runtime host — no persistent disk is required since all data lives in Appwrite Cloud.

Remember to add your `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, and `APPWRITE_DATABASE_ID` as environment variables in your host's dashboard (same values as your local `.env`).

### Option A: Render (Free / $7/mo with Persistent Disk) — Recommended
1. Sign in to [render.com](https://render.com) using your GitHub account.
2. Click **New +** $\to$ **Web Service**.
3. Select your `kaarthi-lifts` GitHub repository.
4. Configure settings:
   - **Name**: `kaarthi-lifts`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: Free (no persistent disk needed — data lives in Appwrite)
   - **Environment Variables**: Add `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`, `APPWRITE_API_KEY`, `APPWRITE_DATABASE_ID`
5. Click **Deploy Web Service**.
6. Render will assign you a live URL (e.g. `https://kaarthi-lifts.onrender.com`).

### Option B: Railway (Fastest setup)
1. Sign in to [railway.app](https://railway.app) with GitHub.
2. Click **New Project** $\to$ **Deploy from GitHub repo** $\to$ choose `kaarthi-lifts`.
3. Railway automatically detects `Dockerfile` or `package.json` and spins it up live with HTTPS and WebSockets.

---

## Step 4: Connect Your Domain (`kaarthilifts1.in`)

Once deployed on Render or Railway:

1. **In Render / Railway Settings**:
   - Go to **Settings** $\to$ **Custom Domains**.
   - Add `kaarthilifts1.in` and `www.kaarthilifts1.in`.
2. **In your Domain Registrar DNS Management (Hostinger / GoDaddy)**:
   - Add the DNS records provided by your host:
     | Type | Name / Host | Target / Value |
     | :--- | :--- | :--- |
     | **CNAME** | `www` | `your-app.onrender.com` (or Railway CNAME) |
     | **A** or **ANAME** | `@` | The IP address provided by host |
3. **SSL Certificate**:
   - Both Render and Railway issue free automatic Let's Encrypt SSL/HTTPS certificates within a few minutes of DNS propagation.

---

## Verification Checklist

- [ ] `https://kaarthilifts1.in` loads the Batman noir landing page with 800vh hero canvas.
- [ ] Real-time availability ribbon shows slots remaining.
- [ ] "Ask Kaarthi" live chat connects via WebSocket.
- [ ] `https://kaarthilifts1.in/admin` opens the Coach Command Center (PIN: `kaarthi2026`).
- [ ] Submitting consultation requests delivers instant notifications to `/admin`.
