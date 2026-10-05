import React, { useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from './ui/button';
import { QrCode, Download, Copy, Image as ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

/**
 * Renders a scannable QR code for a shareable link. The value to encode is the
 * `qr_token` handed down by the backend (the tracked short URL), so a scan opens
 * the form and counts as a click just like the link itself.
 *
 * The QR is shareable exactly like the URL: download it as a PNG, copy the image
 * to the clipboard, or copy the underlying link.
 *
 * Props:
 *   value       - string to encode (qr_token / short URL / full URL)
 *   label       - human label shown in the panel + used for the download filename
 *   accent      - 'primary' (default) | 'secondary' for the trigger button tint
 */
const ShareQr = ({ value, label = 'Registration', accent = 'primary' }) => {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  if (!value) return null;

  const safeName = (label || 'form')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  const fileName = `qr-${safeName || 'form'}.png`;

  const getCanvas = () => wrapRef.current?.querySelector('canvas');

  const downloadPng = () => {
    const canvas = getCanvas();
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success('QR code downloaded!');
  };

  const copyImage = async () => {
    const canvas = getCanvas();
    if (!canvas) return;
    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (blob && navigator.clipboard && window.ClipboardItem) {
        await navigator.clipboard.write([new window.ClipboardItem({ 'image/png': blob })]);
        toast.success('QR image copied!');
      } else {
        throw new Error('unsupported');
      }
    } catch {
      // Browsers without image-clipboard support: fall back to downloading.
      downloadPng();
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(value);
    toast.success('Link copied!');
  };

  const isSecondary = accent === 'secondary';
  const triggerClass = isSecondary
    ? 'shrink-0 border-secondary/30 text-secondary hover:bg-secondary/10'
    : 'shrink-0 border-primary/30 text-primary hover:bg-primary/10';

  return (
    <div className="mt-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        className={triggerClass}
        title={open ? 'Hide QR code' : 'Show QR code'}
      >
        <QrCode className="w-4 h-4 mr-1.5" />
        {open ? 'Hide QR' : 'QR code'}
      </Button>

      {open && (
        <div className="mt-3 inline-flex flex-col items-center gap-3 p-4 bg-card rounded-xl border border-border shadow-card transition-colors">
          <div ref={wrapRef} className="p-3 bg-white rounded-lg border border-border">
            <QRCodeCanvas
              value={value}
              size={180}
              level="M"
              marginSize={2}
              fgColor="#0f172a"
              bgColor="#ffffff"
            />
          </div>
          <p className="text-xs font-jakarta text-muted-foreground max-w-[220px] text-center">
            Scan to open the {label.toLowerCase()} form
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={downloadPng} title="Download PNG">
              <Download className="w-4 h-4 mr-1.5" />
              PNG
            </Button>
            <Button variant="outline" size="sm" onClick={copyImage} title="Copy QR image">
              <ImageIcon className="w-4 h-4 mr-1.5" />
              Copy image
            </Button>
            <Button variant="outline" size="sm" onClick={copyLink} title="Copy link">
              <Copy className="w-4 h-4 mr-1.5" />
              Link
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShareQr;
