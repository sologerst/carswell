"use client";

import { Camera, ScanLine } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toast";
import { api } from "@/lib/utils";
import { extractVin } from "@/lib/vin";

interface DetectedBarcode { rawValue: string }
interface BarcodeDetectorLike { detect(source: CanvasImageSource): Promise<DetectedBarcode[]> }
type BarcodeDetectorCtor = new (opts: { formats: string[] }) => BarcodeDetectorLike;

const VIN_FORMATS = ["code_39", "code_128", "data_matrix", "qr_code", "pdf417"];

function detectorCtor(): BarcodeDetectorCtor | null {
  return typeof window !== "undefined" && "BarcodeDetector" in window
    ? (window as unknown as { BarcodeDetector: BarcodeDetectorCtor }).BarcodeDetector
    : null;
}

/** Downscale a photo to a JPEG data string (no prefix). */
export async function fileToJpegBase64(file: Blob, max = 1600, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("encode failed"))), "image/jpeg", quality));
  const buf = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(bin);
}

/**
 * Scan the VIN barcode on the door jamb or windshield with the camera
 * (BarcodeDetector, Chrome on Android). Elsewhere, read the VIN from a photo
 * (Claude) or type it.
 */
export function VinScanner({ onVin }: { onVin: (vin: string) => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [reading, setReading] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const supported = detectorCtor() !== null;

  useEffect(() => {
    if (!open) return;
    const Ctor = detectorCtor();
    if (!Ctor) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let done = false;
    const detector = new Ctor({ formats: VIN_FORMATS });
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!video.current) return;
        video.current.srcObject = stream;
        await video.current.play();
        timer = setInterval(async () => {
          if (done || !video.current) return;
          const codes = await detector.detect(video.current).catch(() => []);
          for (const c of codes) {
            const vin = extractVin(c.rawValue);
            if (vin) {
              done = true;
              onVin(vin);
              setOpen(false);
              return;
            }
          }
        }, 300);
      } catch {
        toast("Camera unavailable. Take a photo or type the VIN.", "error");
        setOpen(false);
      }
    })();
    return () => {
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [open, onVin, toast]);

  async function fromPhoto(file: File) {
    setReading(true);
    try {
      // Try an on-device barcode read first, then Claude.
      const Ctor = detectorCtor();
      if (Ctor) {
        const codes = await new Ctor({ formats: VIN_FORMATS }).detect(await createImageBitmap(file)).catch(() => []);
        const vin = codes.map((c) => extractVin(c.rawValue)).find(Boolean);
        if (vin) return onVin(vin);
      }
      const res = await api<{ vin: string | null; reason: string | null }>("/api/sell/vin-ocr", { json: { image: await fileToJpegBase64(file, 1400), mime: "image/jpeg" } });
      if (res.vin) onVin(res.vin);
      else toast(res.reason ?? "Couldn't read a VIN.", "error");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      {supported && <Button type="button" variant="secondary" onClick={() => setOpen(true)}><ScanLine /> Scan barcode</Button>}
      <Button type="button" variant="secondary" onClick={() => fileInput.current?.click()} disabled={reading}>
        <Camera /> {reading ? "Reading…" : "Photo of the VIN"}
      </Button>
      <input ref={fileInput} type="file" accept="image/*" capture="environment" className="sr-only" aria-label="Photo of the VIN"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) fromPhoto(f); }} />
      <Sheet open={open} onOpenChange={setOpen} title="Scan the VIN barcode" side="bottom">
        <div className="space-y-3">
          <video ref={video} className="aspect-[4/3] w-full rounded-2xl bg-black object-cover" playsInline muted />
          <p className="text-sm text-muted">Point at the barcode on the driver-side door jamb or the base of the windshield.</p>
        </div>
      </Sheet>
    </div>
  );
}
