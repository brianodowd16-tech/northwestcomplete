import type { Metadata } from "next";
import { Enquire } from "@/components/Enquire";

export const metadata: Metadata = {
  title: "Maintenance & Servicing",
  description: "Stove maintenance in Carrick-on-Shannon: replacement door seals, glass, grates and bricks, plus door refurbishment in our workshop.",
};

const SERVICES = [
  { title: "Door seals & rope", text: "Worn rope lets air in and makes a stove burn too fast. We replace seals for most makes and models." },
  { title: "Replacement glass", text: "Cracked or clouded glass cut and fitted to size, often while you wait." },
  { title: "Grates & fire bricks", text: "Burnt-out grates, baffles and fire bricks replaced to bring your stove back to full efficiency." },
  { title: "Door refurbishment", text: "Sticking or \"wet\" doors repaired and rehung in our own workshop." },
  { title: "Cleaning products", text: "Glass cleaners, stove paint, ash vacuums, chimney brushes and more in store." },
  { title: "Expert advice", text: "Not sure what part you need? Bring in the old one or send us a photo." },
];

export default function ServicingPage() {
  return (
    <div className="wrap" style={{ paddingBottom: 72 }}>
      <header style={{ padding: "48px 0 32px" }}>
        <p className="eyebrow">Maintenance &amp; servicing</p>
        <h1>Keep your stove burning safely</h1>
        <p className="lead">We provide a full stove maintenance service for stoves of every make, wherever you bought them.</p>
      </header>
      <div className="tiles">
        {SERVICES.map((s) => (
          <div key={s.title} className="tile" style={{ minHeight: 0 }}>
            <div>
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          </div>
        ))}
      </div>
      <Enquire subject="a stove service" />
    </div>
  );
}
