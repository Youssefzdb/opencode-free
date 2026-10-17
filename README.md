# Ai Component Playground

انشاء منصة vibe coding كاملة متكاملة لتوليد تطبيقات ومكونات React و Tailwind CSS و Lucide Icons بأسلوب v0 من Vercel.

المواصفات المطلوبة:
1. واجهة مقسمة افتراضياً إلى 25% لوحة محادثة و 75% مساحة المعاينة الحية (Live Preview)، مع إمكانية سحب الحد الفاصل وتكبير وتصغير المحادثة (Resizable Split Pane).
2. زر تبديل في الشريط العلوي للاستبدال الفوري بين المعاينة الحية (Preview) ومحرر الكود (Code view) مع زر نسخ الكود وتنزيل المشروع.
3. دمج كامل مع واجهة الذكاء الاصطناعي المجانية OpenCode Free AI API (المستودع: https://github.com/Youssefzdb/opencode-free-ai-api):
   - الرابط الأساسي: https://superagent-2b61d5b9.base44.app/functions/opencodeChat
   - إدارة الجلسات والذاكرة عبر opencodeSessions
   - النموذج الافتراضي: beam-free مع دعم عرض النماذج الأخرى المتاحة
4. عرض احترافي ودقيق جداً لطريقة تفكير الذكاء الاصطناعي (AI Reasoning Process) في واجهة المحادثة بصندوق قابل للفتح والطي (Collapsible Thought Process)، مع إظهار خطوات تنفيذ الأدوات والملفات (Tool Calls & File Generation Steps) بشكل تفاعلي وجمالي شبيه بـ v0 و Lovable.
5. تشغيل وتصيير فوري لكود React المُولّد داخل iframe أو sandbox في تبويب المعاينة، مع تبديل أحجام الشاشة (Desktop, Tablet, Mobile) وسجل الإصدارات (v1, v2, v3).

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://ai-component-playground.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b9fff80b-3d68-49e7-9378-1a10e9905f47).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
