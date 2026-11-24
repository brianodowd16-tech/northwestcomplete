"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { eur } from "./format";
import { toast } from "./Toasts";

interface Item {
  id: string;
  categoryId: string;
  name: string;
  description: string;
  priceCents: number;
  vatRate: number;
  station: "bar" | "kitchen";
  containsAlcohol: boolean;
  availableForCollect: boolean;
  active: boolean;
  allergens: string[];
}
const ALLERGENS: [string, string][] = [["gluten", "Gluten"], ["crustaceans", "Crustaceans"], ["eggs", "Eggs"], ["fish", "Fish"], ["peanuts", "Peanuts"], ["soya", "Soya"], ["milk", "Milk"], ["nuts", "Tree nuts"], ["celery", "Celery"], ["mustard", "Mustard"], ["sesame", "Sesame"], ["sulphites", "Sulphites"], ["lupin", "Lupin"], ["molluscs", "Molluscs"]];
interface Cat {
  id: string;
  name: string;
  items: Item[];
}

/** Sections and items. Food goes to the kitchen and is never collect-at-bar. */
export function MenuEditor({ slug, cats }: { slug: string; cats: Cat[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null); // item id, or "new:<categoryId>"
  const [busy, setBusy] = useState(false);
  const [station, setStation] = useState<"bar" | "kitchen">("bar");

  async function call(body: Record<string, unknown>) {
    setBusy(true);
    const res = await fetch(`/api/office/${slug}/menu`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast(d.error, { kind: "err" });
      return false;
    }
    router.refresh();
    return true;
  }

  const form = (catId: string, it?: Item) => (
    <form
      key={it?.id ?? `new-${catId}`}
      className="card stack"
      style={{ gap: 10 }}
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const ok = await call({
          action: "item",
          id: it?.id,
          categoryId: f.get("categoryId"),
          name: f.get("name"),
          description: f.get("description"),
          price: f.get("price"),
          vatRate: Number(f.get("vatRate")),
          station: f.get("station"),
          containsAlcohol: f.get("containsAlcohol") === "on",
          availableForCollect: f.get("availableForCollect") === "on",
          active: f.get("active") === "on",
          allergens: f.getAll("allergen"),
        });
        if (ok) {
          toast(it ? "Saved" : "Added to the menu", { kind: "ok" });
          setEditing(null);
        }
      }}
    >
      <div className="two">
        <label className="field">
          Name
          <input name="name" defaultValue={it?.name} required maxLength={80} autoFocus />
        </label>
        <label className="field">
          Price incl. VAT (€)
          <input name="price" inputMode="decimal" defaultValue={it ? (it.priceCents / 100).toFixed(2) : ""} required placeholder="6.20" />
        </label>
        <label className="field">
          Goes to
          <select name="station" defaultValue={it?.station ?? station} onChange={(e) => setStation(e.target.value as "bar" | "kitchen")}>
            <option value="bar">Bar (drinks)</option>
            <option value="kitchen">Kitchen (food, brought to the table)</option>
          </select>
        </label>
        <label className="field">
          VAT rate
          <select name="vatRate" defaultValue={it?.vatRate ?? 23}>
            <option value={23}>23%: alcohol, soft drinks, water</option>
            <option value={9}>9%: food and hot drinks</option>
          </select>
        </label>
        <label className="field">
          Section
          <select name="categoryId" defaultValue={catId}>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Description (optional)
          <input name="description" defaultValue={it?.description} maxLength={300} />
        </label>
      </div>
      <div className="row wrap" style={{ justifyContent: "flex-start", gap: 16 }}>
        <label className="toggle small">
          <input type="checkbox" name="containsAlcohol" defaultChecked={it?.containsAlcohol} /> Contains alcohol (ID check)
        </label>
        <label className="toggle small">
          <input type="checkbox" name="availableForCollect" defaultChecked={it ? it.availableForCollect : true} disabled={station === "kitchen"} /> Can be collected at the bar
        </label>
        <label className="toggle small">
          <input type="checkbox" name="active" defaultChecked={it ? it.active : true} /> On the menu
        </label>
      </div>
      <fieldset className="allergen-pick">
        <legend className="small">Contains (EU allergens: the law requires you to declare these)</legend>
        {ALLERGENS.map(([k, l]) => (
          <label key={k} className="toggle small">
            <input type="checkbox" name="allergen" value={k} defaultChecked={it?.allergens?.includes(k)} /> {l}
          </label>
        ))}
      </fieldset>
      <div className="row" style={{ justifyContent: "flex-start" }}>
        <button className="btn sm" disabled={busy}>
          {it ? "Save" : "Add item"}
        </button>
        <button type="button" className="btn sm ghost" onClick={() => setEditing(null)}>
          Cancel
        </button>
      </div>
    </form>
  );

  return (
    <div className="stack">
      {cats.map((c) => (
        <section key={c.id} className="panel stack">
          <div className="row wrap">
            <h3>{c.name}</h3>
            <div className="row">
              <button
                className="btn sm ghost"
                onClick={async () => {
                  const name = prompt("Rename section", c.name);
                  if (name && name !== c.name) await call({ action: "category", id: c.id, name });
                }}
              >
                Rename
              </button>
              {c.items.length === 0 && (
                <button className="btn sm ghost" onClick={() => call({ action: "deleteCategory", id: c.id })}>
                  Delete
                </button>
              )}
              <button
                className="btn sm"
                onClick={() => {
                  setStation(c.items[0]?.station ?? "bar");
                  setEditing(`new:${c.id}`);
                }}
              >
                + Add item
              </button>
            </div>
          </div>
          {editing === `new:${c.id}` && form(c.id)}
          {c.items.length === 0 && editing !== `new:${c.id}` && <div className="empty">No items yet.</div>}
          {c.items.map((it) =>
            editing === it.id ? (
              form(c.id, it)
            ) : (
              <button
                key={it.id}
                className="menurow"
                onClick={() => {
                  setStation(it.station);
                  setEditing(it.id);
                }}
              >
                <span style={{ minWidth: 0 }}>
                  <b style={{ opacity: it.active ? 1 : 0.5 }}>{it.name}</b>
                  <span className="muted small">
                    {" "}
                    · {it.station === "bar" ? "Bar" : "Kitchen"} · VAT {it.vatRate}%{it.containsAlcohol ? " · alcohol" : ""}
                    {it.availableForCollect ? " · collect" : ""}
                    {!it.active ? " · hidden" : ""}
                    {it.allergens?.length ? ` · ${it.allergens.length} allergen${it.allergens.length > 1 ? "s" : ""}` : it.station === "kitchen" ? " · allergens not set" : ""}
                  </span>
                </span>
                <span className="num">{eur(it.priceCents)}</span>
              </button>
            ),
          )}
        </section>
      ))}
      <button
        className="btn ghost"
        onClick={async () => {
          const name = prompt("New section name (for example: Cocktails)");
          if (name) await call({ action: "category", name });
        }}
      >
        + Add a section
      </button>
    </div>
  );
}
