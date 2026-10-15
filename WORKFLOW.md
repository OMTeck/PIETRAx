# دورة عمل موقع PIETRAx — Workflow

يشرح هذا الملف كيفية عمل الموقع بالكامل: البنية، قاعدة البيانات، النشر، وكيف يصبح أي تعديل مباشرًا على الاستضافة.

---

## 1. البنية العامة (Architecture)

الموقع تطبيق **full-stack** يعمل من **عملية Node واحدة** تخدم ثلاث مكونات:

```
                    ┌─────────────────────────────────────────┐
                   │        المستخدم (المتصفح)                │
                    └───────────────────┬─────────────────────┘
                                        │  HTTPS
                    ┌───────────────────▼─────────────────────┐
                    │     Render  →  Node server (Express)     │
                    │                                          │
                    │   ┌──────────────────────────────────┐   │
                    │   │  الواجهة SPA (dist/)              │   │  ← Vite build
                    │   │  توجيه قائم على Hash (#/…)        │   │
                    │   └──────────────────────────────────┘   │
                    │   ┌──────────────────────────────────┐   │
                    │   │  REST API  (/api/*)               │   │
                    │   │   • /api/auth   (تسجيل دخول/CSRF)  │   │
                    │   │   • /api/materials, /api/…         │   │
                    │   │   • /api/visualizer                 │   │
                    │   └──────────────────────────────────┘   │
                    │   ┌──────────────────────────────────┐   │
                    │   │  ملفات مرفوعة (/uploads/*)         │   │  ← قرص دائم (اختياري)
                    │   └──────────────────────────────────┘   │
                    └───────────────────┬─────────────────────┘
                                        │  Prisma + PostgreSQL
                    ┌───────────────────▼─────────────────────┐
                    │   Supabase PostgreSQL (سحابة)           │
                    │   • 34 جدول: محتوى، مستخدمون، جلسات…      │
                    └──────────────────────────────────────────┘
```

| الجزء | التقنية | مكان التشغيل |
| --- | --- | --- |
| الواجهة (SPA) | React + Vite | تُبنى وتُخدَّم من Express على Render |
| الـ API | Express + Node | Render (منفذ داخلي عبر `PORT`) |
| قاعدة البيانات | PostgreSQL 17 | **Supabase** (سحابة) |
| ORM | Prisma | داخل خادم Node |
| الجلسات/CSRF | جداول في Postgres | Supabase |
| الاستضافة | Render (خطة free) | `https://pietrax.onrender.com` |

---

## 2. دورة إحداث تغيير (الأهم)

أي تعديل على الكود يُنشر تلقائيًا في **3 خطوات**:

```
① عدّل الكود محليًا
        │
        ▼
② git add → commit → push إلى main
        │
        ▼
③ Render يكتشف الـ commit (autoDeploy) → يبني وينشر تلقائيًا
        │
        ▼
   الموقع يتحدث على https://pietrax.onrender.com
```

**الأوامر:**
```bash
git add -A
git commit -m "وصف التعديل"
git push origin main
```

بعد `push` مباشرة:
- Render يبدأ بناءً جديدًا (npm ci + build للواجهة والخادم).
- ينشر النسخة الجديدة خلال دقائق.
- لا حاجة لأي تدخل يدوي (ما لم يكن `autoDeploy` معطّلًا).

> **ملاحظة:** `autoDeploy: yes` مفعّل على الفرع `main` و触发 `commit`. أي push = نشر تلقائي.

---

## 3. التوجيه (Routing)

الواجهة تستخدم **Hash Router** (للتوافق مع الاستضافة الساكنة دون قواعد rewrite):

| الصفحة | الرابط |
| --- | --- |
| الرئيسية | `https://pietrax.onrender.com/` |
| لوحة الأدمن | `https://pietrax.onrender.com/#/admin` |
| Visualizer | `https://pietrax.onrender.com/#/visualizer` |
| المجموعات | `https://pietrax.onrender.com/#/collections` |
| مشروع | `https://pietrax.onrender.com/#/projects` |

- الخادم يخدم `index.html` لكل المسارات غير الـ API (fallback).
- المتصفح يقرأ `#/…` ويعرض الصفحة المناسبة.
- إعادة توجيه تلقائي: زيارة `/admin` تُحوَّل إلى `/#/admin` (أُضيفت في `src/context/RouteContext.tsx`).

---

## 4. قاعدة البيانات (Supabase)

| البند | القيمة |
| --- | --- |
| المشروع | `pietrax` (ref: `ehglbltcbxcjvhumdfby`) |
| المنطقة | `eu-central-1` (فرانكفورت) |
| الإصدار | PostgreSQL 17.11 |
| الاتصال (Session pooler) | `postgresql://postgres.ehglbltcbxcjvhumdfby:<PASSWORD>@aws-1-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require` |
| الجداول | 34 (محتوى، مستخدمون، جلسات، CSRF، تدقيق…) |

- `prisma db push` يزامن المخطط. `npm run db:seed` يزرع البيانات الأولية (16 مادة، 6 مجموعات، 7 غرف visualizer، أدمن).
- الاتصال يتم عبر **Session pooler** (المنفذ 5432) — هو المضيف المعتمد لهذا المشروع (`aws-1` وليس `aws-0`).

---

## 5. متغيرات البيئة (Environment Variables)

تُضبط في Render (Service → Environment)، ولا تُرفع مع الكود:

| المتغير | القيمة / المصدر |
| --- | --- |
| `APP_ENV` | `production` |
| `DATABASE_URL` | رابط Supabase Session pooler (أعلاه) |
| `SESSION_SECRET` | يُولّد تلقائيًا (64 حرفًا) — مطلوب ≥32 في الإنتاج |
| `CSRF_SECRET` | يُولّد تلقائيًا (64 حرفًا) |
| `COOKIE_SECURE` | `true` |
| `TRUST_PROXY` | `true` (خلف Render) |
| `CLIENT_DIST_DIR` | `/opt/render/project/src/dist` |
| `UPLOAD_DIR` | `/opt/render/project/src/server/uploads` |
| `SEED_ADMIN_EMAIL` | `admin@pietra.dev` |
| `SEED_ADMIN_PASSWORD` | `Admin@123456` (يُغيَّر بعد أول دخول) |
| `CLOUDFLARE_AI_WORKER_URL` | رابط Worker الـ AI (مثال: `https://pietrax-ai.svu-acm.workers.dev`) |
| `CLOUDFLARE_AI_WORKER_SECRET` | سر مشترك مع الـ Worker (يطابق `AI_SECRET` في Worker) |

محليًا: تُخزَّن في `server/.env` (غير متتبَّع في git).

---

## 5.1 تعديل الصور بالذكاء الاصطناعي (FLUX.2 klein 4B)

ميزة **Edit with AI** مدمجة داخل الـ Visualizer الموجود (رفع صورة غرفة → تعديلها بنص وصفي):

```
المتصفح → POST /api/visualizer/ai-edit (صورة ≤512px + prompt)
        → خادم Node (يملك السر) → Cloudflare Worker (pietrax-ai)
        → Workers AI binding → @cf/black-forest-labs/flux-2-klein-4b
        → يرجع صورة data URL → تُعرض/تُقارن/تُستعاد في الواجهة
```

- **الأمان:** السر لا يظهر أبدًا في الواجهة ولا في `VITE_*`، ويبقى في الخادم والـ Worker فقط.
- **الحد:** يجب أن تكون الصورة المدخلة **≤ 512×512** (يُصغّرها العميل تلقائيًا في `imagePreprocessor.compressImage`).
- **الحفظ:** النتيجة تمر عبر سير العمل الموجود (`snapshotElement` + تحميل/مشاركة)، والصورة الأصلية تبقى للمقارنة والاستعادة.
- **متغيرات Render:** `CLOUDFLARE_AI_WORKER_URL` و `CLOUDFLARE_AI_WORKER_SECRET` (انظر الجدول أعلاه).
- **نشر الـ Worker:** `npx wrangler deploy --config worker/wrangler.toml` (مستقل عن نشر Render).

---

## 6. الأمان (Security)

- **CSRF**: تدقيق مزدوج (double-submit) لكل طلبات `/api` المغيّرة — يجلب العميل رمزًا من `GET /api/auth/csrf` ويرسله في `X-CSRF-Token`.
- **الجلسات**: HttpOnly cookie (`pietrax.sid`) + تخزين في Postgres.
- **كلمات المرور**: تجزئة (hash).
- **MFA**: مفعّل إلزاميًا لدورَي OWNER/ADMIN من إعداد `security.requireMfaRoles`.
- **CSP + رؤوس آمنة**: عبر helmet.
- **CORS**: لا يُفتح إلا لأصول صريحة.

---

## 7. البناء والنشر (أوامر Render)

| المرحلة | الأمر |
| --- | --- |
| البناء (build) | `npm ci → cd server && npm ci && npm run db:generate → cd .. && npm run build → cd server && npm run build` |
| البدء (start) | `node server/dist/index.js` |
| فحص الصحة | `GET /health` → `{ok:true, db:'up'}` |
| الجدولة | النشر التلقائي عند كل push إلى `main` |

---

## 8. نقاط مهمة قبل الإنتاج

1. **غيّر كلمة مرور الأدمن الافتراضية** فورًا.
2. **قرّر بشأن MFA** — إبقاؤه أكثر أمانًا، أو تعطيله مؤقتًا للعرض (تغيير `security.requireMfaRoles` في Supabase).
3. **قرص الرفعات** — الصور المرفوعة لا تبقى بين عمليات النشر بدون قرص دائم (render.yaml يتضمن `disk` 1GB).
4. **الخطة المجانية** — ينام الخادم بعد ~15 دقيقة خمول ويستيقظ على أول طلب.
5. **الرابط النهائي**: `https://pietrax.onrender.com` — أدمن: `/#/admin`.

---

## 9. استكشاف الأخطاء (Troubleshooting)

| العرض | السبب المحتمل | الحل |
| --- | --- | --- |
| صفحة بيضاء في الأدمن | تستخدم `/admin` بدون hash | استخدم `/#/admin` (أو التوجيه التلقائي) |
| `SESSION_SECRET must be ≥ 32` | غير مضبوط في الإنتاج | أضف `SESSION_SECRET`/`CSRF_SECRET` في Render |
| `tenant not found` من Supabase | مضيف pooler خاطئ | استخدم `aws-1-…pooler.supabase.com` (جلسة: 5432) |
| `buildCommand is required` | حقل البناء في مكان غير صحيح | ضع `buildCommand`/`startCommand` في `envSpecificDetails` |
| 403 عند تسجيل الدخول | رمز CSRF مفقود | احصل على رمز من `/api/auth/csrf` أولًا |
| النشر لم يبدأ | `autoDeploy: no` | فعّله في إعدادات الخدمة أو شغّل نشرًا يدويًا |
| AI edit يرجع `AI_DISABLED` | متغيرات Worker غير مضبوطة على Render | أضف `CLOUDFLARE_AI_WORKER_URL` و `CLOUDFLARE_AI_WORKER_SECRET` |
| خطأ 401 من الـ Worker | السر لا يطابق `AI_SECRET` | وحّد `CLOUDFLARE_AI_WORKER_SECRET` مع سر الـ Worker |
| مخرجات AI بمقاس > 512 | صورة إدخال كبيرة | تأكد أن العميل يصغّر إلى 512px قبل الإرسال |
