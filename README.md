# 🚀 Project Setup Guide

## 🐍 1. Create & Activate Python Virtual Environment

```bash
python3 -m venv venv
source venv/bin/activate
```

## 📦 2. Install Dependencies with pnpm

```bash
pnpm install
```

## 🔐 3. Add Environment Variables

Create a `.env` file and add:

```
CLICKHOUSE_HOST=your_host
CLICKHOUSE_USER=your_user
CLICKHOUSE_PASSWORD=your_password
OPENAI_API_KEY=your_openai_key
```

## ▶️ 4. Run the Application

```bash
pnpm run dev
```
