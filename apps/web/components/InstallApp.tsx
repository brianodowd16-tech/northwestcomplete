"use client";
import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** "Add to home screen" for the venue's app. Hidden inside the native app, once installed, or after "Not now". */
export function InstallApp({ name }: { name: string }) {
  const [evt, setEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    const w = window as Window & { Capacitor?: unknown; navigator: Navigator & { standalone?: boolean } };
    const standalone = window.matchMedia("(display-mode: standalone)").matches || w.navigator.standalone === true || !!w.Capacitor;
    let dismissed = false;
    try {
      dismissed = Number(localStorage.getItem("complete-install-dismissed") ?? 0) > Date.now() - 14 * 86_400_000;
    } catch {}
    if (standalone || dismissed) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as BeforeInstallPromptEvent);
      setHidden(false);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && /safari/i.test(navigator.userAgent) && !/crios|fxios/i.test(navigator.userAgent);
    if (isIos) {
      setIos(true);
      setHidden(false);
    }
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (hidden) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem("complete-install-dismissed", String(Date.now()));
    } catch {}
  };
  return (
    <div className="install rise" role="region" aria-label="Install the app">
      <div style={{ minWidth: 0 }}>
        <b>Get the {name} app</b>
        <div className="small muted">{ios ? "Tap Share, then “Add to Home Screen”." : "Order faster next time and get told when your drinks are ready."}</div>
      </div>
      <div className="row">
        {evt && (
          <button
            className="btn sm"
            onClick={async () => {
              await evt.prompt();
              await evt.userChoice;
              setEvt(null);
              setHidden(true);
            }}
          >
            Install
          </button>
        )}
        <button className="btn sm ghost" onClick={dismiss} aria-label="Not now">
          Not now
        </button>
      </div>
    </div>
  );
}
