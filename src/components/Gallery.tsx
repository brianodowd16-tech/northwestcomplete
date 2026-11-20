"use client";

import Image from "next/image";
import { useState } from "react";

export function Gallery({ images, name }: { images: { src: string; alt: string }[]; name: string }) {
  const [active, setActive] = useState(0);
  const current = images[active];
  return (
    <div>
      <div className="gallery__main">
        {current && <Image src={current.src} alt={current.alt || name} fill priority sizes="(max-width: 860px) 100vw, 640px" />}
      </div>
      {images.length > 1 && (
        <div className="gallery__thumbs">
          {images.map((img, i) => (
            <button key={img.src} type="button" aria-pressed={i === active} aria-label={`Show image ${i + 1} of ${images.length}`} onClick={() => setActive(i)}>
              <Image src={img.src} alt="" fill sizes="76px" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
