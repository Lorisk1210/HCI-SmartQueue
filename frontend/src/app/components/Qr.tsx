"use client";

// =====================================================================
// QR Code Component - QR Code Generator
// =====================================================================
// Generates a QR code image from the provided text/URL. Uses the qrcode
// library to create a data URL that can be displayed as an image.
// Used in the ScanOverlay component to generate ticket tracking QR codes.

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';

type Props = { 
  // Text or URL to encode in the QR code
  text: string;
  // Size of the QR code in pixels (default: 240)
  size?: number;
  // Optional CSS class name for styling
  className?: string;
};

export default function Qr({ text, size = 240, className }: Props) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const url = await QRCode.toDataURL(text, { width: size, margin: 1, errorCorrectionLevel: 'M' });
        if (active) setDataUrl(url);
      } catch (_) {
        // ignore
      }
    })();
    return () => { active = false; };
  }, [text, size]);
  if (!dataUrl) return null;
  return <img src={dataUrl} width={size} height={size} alt="QR code" className={className} />;
}


