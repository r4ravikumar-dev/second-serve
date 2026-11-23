"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function Qr({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => { QRCode.toDataURL(value, { margin: 1, width: 400 }).then(setSrc).catch(() => setSrc(null)); }, [value]);
  return src ? <img className="qr" src={src} alt="Pickup QR code" /> : null;
}
