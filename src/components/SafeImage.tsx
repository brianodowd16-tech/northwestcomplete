"use client";

import Image, { type ImageProps } from "next/image";
import { useState } from "react";

/** next/image that falls back to a neutral placeholder if the source 404s (some old WordPress uploads are missing). */
export function SafeImage(props: ImageProps) {
  const [broken, setBroken] = useState(false);
  if (broken) {
    return (
      <div className="img-fallback" aria-hidden="true">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 3c2 3 5 5 5 9a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
      </div>
    );
  }
  return <Image {...props} alt={props.alt} onError={() => setBroken(true)} />;
}
