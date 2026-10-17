import { useEffect, useState } from "react";
import { Copy, Download, Radio } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function BridgePanel({ onLoad }: { onLoad: () => void }) {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/api/public/bridge`;
  const example = `curl -X POST ${url} \\
  -H "Authorization: Bearer $BRIDGE_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"mode":"replace","message":"first build","files":{
    "src/App.tsx":"import Hero from \\"./components/Hero\\";\\nexport default function App(){return <Hero/>}",
    "src/components/Hero.tsx":"export default function Hero(){return <h1 className=\\"p-10 text-4xl\\">Hello</h1>}"
  }}'`;
  const copy = async (t: string) => {
    await navigator.clipboard.writeText(t);
    toast.success("تم النسخ");
  };
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1.5 text-xs" aria-label="الجسر">
          <Radio className="size-3.5 text-primary" /> الجسر
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[420px] space-y-3 text-xs" dir="rtl">
        <div>
          <p className="font-semibold">جسر الذكاء الاصطناعي المحمي</p>
          <p className="mt-1 text-muted-foreground">
            أي ذكاء اصطناعي يرسل ملفات المشروع إلى هذا الرابط مع التوكن السري، فتظهر هنا فورًا
            وتُبنى في المعاينة. الطلب بدون التوكن يُرفض.
          </p>
        </div>
        <div className="flex items-center gap-1" dir="ltr">
          <code className="flex-1 truncate rounded bg-muted px-2 py-1.5 font-mono">POST {url}</code>
          <Button size="icon" variant="ghost" className="size-7" onClick={() => copy(url)}>
            <Copy className="size-3.5" />
          </Button>
        </div>
        <pre
          dir="ltr"
          className="max-h-48 overflow-auto rounded bg-muted p-2 font-mono text-[10.5px] leading-4"
        >
          {example}
        </pre>
        <ul className="list-disc space-y-0.5 pr-4 text-muted-foreground">
          <li>
            <code>mode</code>: <code>merge</code> يدمج مع الملفات الحالية، و<code>replace</code>{" "}
            يستبدلها.
          </li>
          <li>
            <code>delete</code>: قائمة مسارات لحذفها. <code>GET</code> يعيد الملفات الحالية.
          </li>
          <li>يعمل الرابط على النسخة المنشورة من تطبيقك.</li>
        </ul>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => copy(example)}>
            <Copy className="size-3.5" /> نسخ المثال
          </Button>
          <Button size="sm" className="gap-1.5" onClick={onLoad}>
            <Download className="size-3.5" /> تحميل آخر نسخة
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
