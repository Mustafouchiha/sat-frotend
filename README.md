# sat-frotend — SAT Prep Telegram Mini App

Digital SAT tayyorlov Mini App'ining frontend qismi: React + Vite + TypeScript + Tailwind + KaTeX.
Backend (API, bot, baza): https://github.com/Mustafouchiha/sat-backend

Bot: [@SATlyBot](https://t.me/SATlyBot)

## Imkoniyatlar

- O'quvchi: bosh sahifa (reyting, streak, vazifalar), erkin mashq, kunlik test, Puzzle Rush, Duel, xatolar daftari, reyting jadvallari, profil
- Test ekrani (Bluebook kabi): server taymeri, savollar navigatori, belgilash, javobni chizib tashlash, kalkulyator, formulalar, offline javob navbati
- O'qituvchi: guruhlar, topshiriqlar, o'quvchi tahlili, Excel eksport
- Operator/Admin: savol shabloni muharriri (preview, 500-variant tekshiruv, AI yordamchi), testlar, foydalanuvchilar, sozlamalar, statistika
- Tillar: o'zbek, rus, ingliz

## Vercel'ga deploy

1. https://vercel.com → **Add New → Project** → `sat-frotend` repo'sini tanlang.
2. Framework: **Vite** (aniqlanadi). Root Directory — bo'sh qoldiring. Build `npm run build`, output `dist` (`vercel.json` da).
3. **Environment Variables:**

   | O'zgaruvchi | Qiymat |
   |---|---|
   | `VITE_API_URL` | Railway'dagi API manzili, masalan `https://sat-backend-production.up.railway.app` |
   | `VITE_BOT_USERNAME` | `SATlyBot` |

4. **Deploy** → hosil bo'lgan manzilni (`https://<loyiha>.vercel.app`) Railway'dagi `MINI_APP_URL` ga yozing va API'ni qayta deploy qiling.

`VITE_*` o'zgaruvchilar build paytida kodga kiradi — ularni o'zgartirgandan keyin Vercel'da **Redeploy** qiling.

## Lokal ishga tushirish

```bash
npm install
```

`.env.local` (namuna: `.env.example`):

```env
VITE_API_URL=http://localhost:4000
VITE_DEV_LOGIN=true
```

```bash
npm run dev
```

http://localhost:5173 — Telegram'siz test foydalanuvchi tugmalari (API'da `ALLOW_DEV_LOGIN=true` bo'lsa).

```bash
npm run build
```
