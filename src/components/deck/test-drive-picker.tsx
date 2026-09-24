"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/primitives";
import { Sheet } from "@/components/ui/sheet";

const SLOTS = ["9am-12pm", "12pm-3pm", "3pm-6pm"];

/** Super-like = test-drive request with 2-3 proposed windows. */
export function TestDrivePicker({
  open, onOpenChange, onConfirm, title,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (windows: { day: string; time: string }[]) => void;
  title: string;
}) {
  const days = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    for (let i = 1; i <= 7; i++) {
      const x = new Date(d);
      x.setDate(d.getDate() + i);
      out.push(x.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }));
    }
    return out;
  }, []);
  const [picked, setPicked] = useState<{ day: string; time: string }[]>([]);
  const toggle = (day: string, time: string) => {
    setPicked((p) => {
      const has = p.some((w) => w.day === day && w.time === time);
      if (has) return p.filter((w) => !(w.day === day && w.time === time));
      return p.length >= 3 ? p : [...p, { day, time }];
    });
  };
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="When could you test drive?" description={`Pick 2-3 windows for the ${title}. The dealer confirms one.`}>
      <div className="space-y-4">
        {days.map((day) => (
          <div key={day}>
            <p className="mb-2 text-sm font-bold text-muted">{day}</p>
            <div className="flex flex-wrap gap-2">
              {SLOTS.map((time) => (
                <Chip key={time} selected={picked.some((w) => w.day === day && w.time === time)} onClick={() => toggle(day, time)}>{time}</Chip>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="sticky bottom-0 mt-6 bg-navy-900 pt-3">
        <Button size="lg" className="w-full bg-drive text-navy-950 hover:bg-drive/90" disabled={picked.length < 2} onClick={() => { onConfirm(picked); setPicked([]); }}>
          {picked.length < 2 ? `Pick ${2 - picked.length} more` : `Request test drive (${picked.length} windows)`}
        </Button>
      </div>
    </Sheet>
  );
}
