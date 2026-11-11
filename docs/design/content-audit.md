# تدقيق محتوى — قراءة فقط (ELA-5 مصغر)
# Content Audit — read-only pre-check for ELA-6

> هذا الملف تدقيق قراءة فقط: لا يغيّر شيئاً، فقط يوثق مصدر كل قيمة ستُستخرج إلى tokens.json

## مصدر التدقيق
- `showcase/index.html` (443 سطر) — الملف الوحيد الذي يحتوي هوية بصرية حالية
- لا يوجد `tokens.json` سابق — هذه أول مرة

## الألوان المكتشفة — كل قيمة موثقة بمصدرها

| Token | القيمة | المصدر في showcase | الاستخدام |
|---|---|---|---|
| `color.background.primary` | `#080B10` | `:root --bg` | خلفية الصفحة الرئيسية |
| `color.background.secondary` | `#0F1520` | `:root --bg2` | لم يُستخدم بعد — احتياطي |
| `color.surface.panel` | `#111A28` | `:root --panel` | خلفية البطاقات |
| `color.surface.panel-elevated` | `#172539` | `:root --panel2` | أزرار + خلفية hero-card |
| `color.border.default` | `#1F3347` | `:root --line` | حدود خفيفة |
| `color.border.strong` | `#2A4A66` | `:root --line2` | حدود مركزة (focus) |
| `color.text.primary` | `#EAF0F7` | `:root --text` | نص أساسي |
| `color.text.muted` | `#8EA3B8` | `:root --muted` | نص ثانوي |
| `color.text.dim` | `#5C738C` | `:root --dim` | تذييل |
| `color.accent.primary` | `#3EE8A8` | `:root --accent` | رابط + زر أساسي + تدرج |
| `color.accent.secondary` | `#2AD4F0` | `:root --accent2` | تدرج ثانوي |
| `color.accent.warning` | `#FFB86B` | `:root --accent3` | أيقونة تحذير |
| `color.accent.violet` | `#8B7DFF` | `:root --violet` | أيقونة بنفسجي |

## ما لم يُكتشف (لن يُخترع)
- لا ألوان إضافية خارج `:root` — أي لون جديد يحتاج ADR أو قرار تصميم
- لا قيم HSL — كلها HEX 6 أرقام، نحتفظ بها كما هي

## ما سيُنشأ في ELA-6
- `tokens.json` — الألوان أعلاه + spacing + typography + radius + shadow
- `tokens/typography.json` — سلم الخطوط (IBM Plex Arabic / Instrument Sans / Mono)
- `/tokens` معاينة — قراءة فقط، لا تغير showcase
- لا تحويل تلقائي لمكونات showcase إلى tokens في هذه الخطوة (يأتي لاحقاً بعد الاعتماد)

> قيد: لا نعتبر إنشاء الملف دليل استخدام — التحقق هو أن showcase الحالي يطابق tokens المستخرجة
