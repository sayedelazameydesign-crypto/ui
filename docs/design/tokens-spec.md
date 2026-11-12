# نظام الرموز — Tokens Spec v1.0.0 (ELA-6)

> **المبدأ:** الرموز هي المصدر الوحيد للحقيقة البصرية — لا لون يُستخدم إلا إذا وُجد في `tokens.json`

## المصدر
كل قيمة في `tokens.json` مستخرجة من `showcase/index.html:8-10` (`:root` CSS variables) — لا قيم مخترعة. التدقيق في `docs/design/content-audit.md`.

## البنية
```
tokens.json
├── color.background / surface / border / text / accent
├── spacing (xs..3xl — 4px base)
├── radius (sm..full)
├── shadow (card, accent)
└── font.family / size / weight
tokens/typography.json — سلم الطباعة
```

## الاستخدام المقصود (ليس مطبقًا بعد في هذه الخطوة)
- المرحلة الحالية: **استخراج + معاينة فقط** — showcase يظل كما هو
- المرحلة التالية بعد المراجعة: تحويل `showcase` لاستخدام `var(--token-*)` المولدة من `tokens.json`
- الأداة المقترحة لاحقًا: مولد CSS variables من JSON (Style Dictionary) — لا يُضاف الآن

## RTL
- لا توجد قيم اتجاهية (`left/right`) في tokens — فقط ألوان/مسافات/خطوط
- الاستراتيجية الكاملة في `docs/design/rtl-strategy.md` (ELA-7)

## التحقق
```bash
python3 -m json.tool tokens.json  # valid JSON
node scripts/validate-json.mjs    # يفشل عند مفتاح مجهول
```

## ما ليس في هذه المرحلة
- لا تحويل تلقائي لـ showcase
- لا ألوان جديدة خارج الجدول أعلاه — أي إضافة تحتاج PR جديد
