# صفحة الـ Visualizer — الحالة الحالية الفعلية (من الكود على القرص)

> المصدر: `C:\Users\HX\Desktop\WebNew\PIETRAx\src\pages\VisualizerPage.tsx` (655 سطرًا)
> تمت القراءة من الملف الفعلي عبر bash في هذا التاريخ. هذا يوثّق **ما موجود الآن فعلًا**، لا المخطَّط.

---

## 1) المكوّن والواردات

- `VisualizerPage` — مكوّن رئيسي في `src/pages/`.
- يستخدم favor:
  - `useLang()` / `useRoute()` / `useWishlist()` / `useCatalog()` (سياقات التطبيق).
  - `pubMaterialName` من `@/lib/public`.
  - `Reveal`, `LazyImage` من `@/components/ui/Reveal`.
  - أيقونات `lucide-react`: `ArrowLeft, ArrowRight, Upload, X, ZoomIn, RotateCcw, Maximize2, Heart, Download, Share2, ChevronLeft, ChevronRight, Check`.

---

## 2) الخطوات (Step flow)

- `type Step = 'room' | 'surface' | 'material' | 'result'` — تدفق من ٤ خطوات مع مؤشر خطوات في الأعلى (`step indicator`):
  1. **room** — اختيار الغرفة الجاهزة أو رفع صورة.
  2. **surface** — اختيار سطح الغرفة (أو سطح تلقائي للصور المرفوعة: floor/wall/countertop).
  3. **material** — اختيار مادة من المكتبة (بحث + فلترة بالتصنيف).
  4. **result** — تطبيق المادة + أدوات معاينة (compare slider، zoom، حفظ/مشاركة).

---

## 3) المساعدات المُضمّنة (On-device, بلا API/شبكة)

تعمل في المتصفح محليًا — **لا توجد أي اعتماديات معالجة صور خارجية** (لا OpenCV ولا نماذج تحميل):

| الدالة | الوظيفة |
|---|---|
| `RoomLuma { w, h, luma: Float32Array }` | واجهة لصورة لمعان مصغّرة. |
| `imageLuma(img, maxW, maxH)` | يقلّص الصورة (أدنى 48px، أقصى 256px) ويستخرج اللمعان `0.299R+0.587G+0.114B` لكل بكسل عبر canvas. |
| `detectHorizon(room)` | يجد الصف ذا أقوى انحدار سطوع عمودي في نطاق 30%–85% من الارتفاع → نسبة الأفق (0..1). |
| `estimatePxPerMeter(imgW)` | تقدير بكسلات لكل متر: `max(80, round(imgW/4))` — افتراض عرض غرفة 4م. |
| `RoomLayout { horizonY, pxPerMeter }` | نتيجة التحليل الأُحادي. |
| `analyzeRoomPhoto(img)` | يلخّص: لمعان → أفقي + مقياس. يُستدعى عند `img.onload` في الـ useEffect. |
| `SurfaceKind` | اتحاد `'floor' | 'wall' | 'ceiling' | 'countertop'`. |
| `tileCss(opts)` | يبني نمط CSS للبلاط بمقياس فيزيائي حقيقي (cm) + إمالة منظور CSS 3D:
  • floor: `perspective(900px) rotateX(56deg)`, origin `50% 0%`
  • wall: `rotateX(-14deg)`, origin `50% 50%`
  • ceiling: `rotateX(-62deg)`, origin `50% 100%`
  • countertop: `rotateX(18deg)`, origin `50% 0%`
  + `backgroundSize` بـ `px/tile`, `repeat`, `mixBlendMode: multiply`, `backfaceVisibility: hidden`. |
| `applySurfaceClip(surfaceId)` | في وضع الرفع يُرجع أقنعة افتراضية: floor `0 55%→100%`, wall `0 0→55%`, countertop `40%→60%`؛ خلاف ذلك من `clipPath` الغرفة المختارة. |

### ملاحظات هندسية دقيقة
- مقياس البلاط (تيل) الحالي: **countertop 60cm، ceiling 30cm، والبقية 40cm** عبر `surfTileCm`.
- `tileCss` **مُعرَّف لكنه غير مستدعى بعد في أي مكان بالمكوّن** — كتلة المقارنة/التطبيق الحالية تستخدم `backgroundSize: cover` مسطّح (وليس منظورًا). أي أن المنظور "جاهز لكن غير موصول".

---

## 4) البيانات المحلية (State)

```
step: 'room' | 'surface' | 'material' | 'result'
selectedRoomId, selectedSurfaceId, selectedMaterialId
showCompare, compareMaterialId
uploadMode (bool), uploadedImage (dataURL | null), uploadSurface ('floor')
searchQuery, filterCategory ('All' | نوع)
sliderPos (0-100), zoom (1|1.5), showSaved
layout: RoomLayout | null          ← نتيجة analyzeRoomPhoto
fileRef (input توافقًا للرفع)
```

- `presetMaterialSlug` من `?material=...` (رابط مباشر) — إذا وُجد، يُحدد الغرفة/السطح/المادة ويتجه مباشرة إلى `result`.
- بيانات المواد (`visMaterials`) تُشتق من الكتالوج عبر `useCatalog` (اسم مترجم وفق `lang`, نوع/لون/لمعان/حجم).
- التصنيفات (`categories`) مميزة من `typeCode` مع ترجمات `labelAr/labelEn`.

---

## 5) الواجهة لكل خطوة (ما يُعرض فعليًا)

### الخطوة room
- زر إفلات/رفع كبير (حدود منقّطة): `uploadYourRoom` + وصف؛ `accept="image/*"` ⇒ `handleFileUpload` (FileReader → dataURL → `uploadMode=true`, step=surface).
- شبكة غرف جاهزة (بطاقات `LazyImage` + غشاء داكن عند hover + الاسم بالعربي/الإنجليزي). النقر → يختار الغرفة ويذهب لـ surface.

### الخطوة surface
- زر «changeRoom» للرجوع.
- إطار 16:10: الصورة + **أقنعة تفاعلية** لكل سطح (كل سطح button شفاف مع `clipPath`) — عند تحويم المؤشر يخضرّ ويظهر اسم السطح.
- أزرار شرائح سطحية صغيرة أسفلها للاختيار المباشر.
- في وضع الرفع: ثلاثة أسطح افتراضية **floor / wall / countertop** فقط (لا ceiling) بأقنعة 55%/55%/40–60%.
- **خلل معروف:** اسماء الأسطح المرفوعة في `uploadSurfaces` تحتوي **نصًا عربيًا تالفًا** (`'O,U,O�O�O�USOc'` بدل "الأرضية" مثلًا) بسبب تلف ترميز في الملف.

### الخطوة material
- زر «changeSurface».
- **بحث** (نص، `searchMaterials`) + **فلتر** بتصنيفات (`all` + categories بشريط أفقي).
- شبكة مواد 3/5/6 أعمدة، `LazyImage` + عداد مع scand غامق عند الاختيار؛ التمرير رأسيًا حتى 500px. النقر → يحدد ويرسل إلى result.

### الخطوة result
- أزرار: `changeMaterial`, `reset` (zoom 1↔1.5)، `reset` كامل، `compare` (تبديل).
- **سطح العرض (Visualizer) 16:10:**
  - الخامة المختارة تُطبق بكامل الصورة مع `clipPath` (السطح المختار) و `backgroundSize: cover` و `mixBlendMode: multiply` و `opacity: 0.85`.
  - وضع المقارنة (before/after): طبقة ثانية بنفس الخامة (أو `compareMaterialId`) مقصوصة بـ `polygon(0 0, sliderPos% 0, ...)` + شريط سحب أبيض دائري + input range خفي — مع علامات `before`/`after`.
  - عند غير المقارنة: شارة باسم السطح المختار (سفل-يسار).
  - **ملاحظة:** `zoom` يُطبَّق على الحاوية نفسها (`transform: scale`), يؤدي لتكبير كل الإطار.
- **لوحة المادة المختارة**: صورة مصغّرة + النوع/اللون/اللمعان/الحجم + أزرار `viewDetails` و`requestQuote` (يثبّتان إلى `/material/<slug>`).
- **afعالية الحفظ**: `saveDesign` (يُحدّث wishlist عبر `toggle` + رسالة «تم الحفظ» عائمة لمدة 2 ثانية — **رسالة عربية تالفة أيضًا**: `${t('saveDesign')} �o"`), و`downloadImage` و`share` (لا معالِج فعلي — أزرار صامتة حاليًا).

---

## 6) ما يعمل / ما لا يعمل (ملاحظات سريرية من الكود)

| العنصر | الحالة |
|---|---|
| تدفق الغرف الجاهزة ← مواد | ✅ يعمل (كتالوج + شهر المؤشر + مقارنة). |
| رفع صورة واختيار سطح | ✅ يعمل، أقنعة افتراضية سفلية. |
| تحليل تلقائي (أفق/مقياس) | ✅ يُحسب ويُخزن في `layout` — **لكن `layout` غير مستخدم في العرض حاليًا** (نتيجة التحليل غير مربوطة بعد بالطبقة المنظورية). |
| تطبيق الخامة بمنظور حقيقي (`tileCss`) | ⚠️ دالة جاهزة لكن **غير مستدعاة** — العرض ما يزال `cover` مسطّحًا. |
| دقة تمييز الجدار/السقف/الأرضية/المجلة | ❌ تلقائي جزئي فقط (أقنعة بنسب ثابتة لأعلى/أسفل الصورة). |
| تطبيق على أي جزء يختاره الزائر (نقرة Free) | ❌ غير مضمن بعد — حاليًا مقصور على الأسطح الافتراضية. |
| `downloadImage` / `share` | ⚠️ أزرار بلا معالجات فعلية. |
| الرسائل العربية داخل `uploadSurfaces` وشريط الحفظ | ⚠️ **نص تالف** (أحرف مشوّهة في الملف) — يحتاج إصلاح ترميز. |
| الترجمات في `t('...')` | ✅ تمر بسياق الترجمة (بعد بنائها من لوحات اللغة). |
| نوع-check / build | ✅ نظيف حاليًا (`npm run typecheck` و`npm run build` ينجحان). |

---

## 7) اعتماديات/هندسة

- **React 18 + Vite 5 + Tailwind** — بلا إضافات معالجة صور.
- الخادم (Node :4000) يبث API الصغير فقط (كتالوج/ووغيره) — **صفر معالجة صور على الخادم**. كل التحليل في المتصفح، وهذا متوافق تمامًا مع استضافة رخيصة.

---

## 8) خطوات تطوير مقترحة (التالي)

1. **ربط `layout` في العرض**: استخدام `tileCss` مع `horizonY`/`pxPerMeter` المحسوبين بدل `cover` المسطّح.
2. **إصلاح النص التالف** في `uploadSurfaces` وفي رسالة "تم الحفظ".
3. **نقرة-حرّة ذكية (أي جزء)** — الصبغ التفاعلي الموصوف في `VISUALIZER.md` (القسم 4).
4. تنفيذ `downloadImage`/`share` فعليًا (canvas snapshot).
5. بعد ذلك، اختياريًا زر AI (TF.js) كطبقة غير افتراضية.