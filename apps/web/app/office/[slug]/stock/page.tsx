import { COUNT_UNIT, MENU_CLASS_TEXT, WASTE_REASONS, formatQty, type StockUnit } from "@round/core";
import * as inv from "@round/db/inventory";
import Link from "next/link";
import { ActionForm } from "@/components/ActionForm";
import { eur } from "@/components/format";
import { StaffNav } from "@/components/StaffNav";
import { VenueTheme } from "@/components/VenueTheme";
import { requireStaffFor } from "@/lib/server";

export const dynamic = "force-dynamic";

const TABS = [
  ["overview", "Overview"],
  ["items", "Stock items"],
  ["recipes", "Recipes"],
  ["deliveries", "Deliveries"],
  ["orders", "Supplier orders"],
  ["counts", "Stock counts"],
  ["waste", "Waste"],
  ["till", "Till sales"],
  ["reports", "Profit"],
] as const;
type Tab = (typeof TABS)[number][0];

const inUnit = (qty: number, unit: string) => String(Math.round((qty / COUNT_UNIT[unit as StockUnit].factor) * 1000) / 1000);
const CLASS_CHIP = { star: "ok", plowhorse: "warn", puzzle: "plain", dog: "crit" } as const;

export default async function StockPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ tab?: string; p?: string; edit?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const { staff, venue } = await requireStaffFor(slug, { admin: true });
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? "overview") as Tab;
  const api = `/api/office/${slug}/stock`;
  const { items, suppliers } = await inv.stockLevels(venue);
  const days = sp.p === "30d" ? 30 : 7;
  const to = new Date(Date.now() + 60_000);
  const from = new Date(Date.now() - days * 86_400_000);

  let body: React.ReactNode = null;

  if (tab === "overview") {
    const [profit, waste, counts, suggested] = await Promise.all([inv.profitReport(venue, from, to), inv.wasteReport(venue, from, to), inv.recentCounts(venue, 1), inv.suggestedOrders(venue)]);
    const low = items.filter((i) => i.low);
    body = (
      <>
        <div className="kpis">
          <div className="panel kpi"><b className="num">{eur(items.reduce((s, i) => s + i.valueCents, 0))}</b><span>Stock value at cost</span></div>
          <div className="panel kpi"><b className="num">{profit.totals.gpPct}%</b><span>Gross profit, last {days} days</span></div>
          <div className="panel kpi"><b className="num">{eur(waste.totalCents)}</b><span>Waste, last {days} days</span></div>
          <div className="panel kpi"><b className="num">{counts[0] ? eur(counts[0].varianceCents) : "—"}</b><span>{counts[0] ? `Unexplained at last count (${new Date(counts[0].countedAt).toLocaleDateString("en-IE")})` : "No stock count yet"}</span></div>
          <div className="panel kpi"><b className="num">{low.length}</b><span>Items below par</span></div>
        </div>
        {items.length === 0 && (
          <div className="panel stack">
            <h3>Set up stock in four steps</h3>
            <ol className="muted" style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 4 }}>
              <li><Link href="?tab=items">Add your suppliers and stock items</Link> (kegs, bottles, food) with pack sizes and prices.</li>
              <li><Link href="?tab=recipes">Add a recipe to each menu item</Link>: what one serving uses.</li>
              <li><Link href="?tab=counts">Do an opening stock count.</Link></li>
              <li>Record deliveries as they arrive. App orders take stock out automatically; <Link href="?tab=till">import till sales</Link> for counter sales.</li>
            </ol>
          </div>
        )}
        <div className="two">
          <section className="panel stack">
            <div className="row"><h3>Running low</h3>{suggested.length > 0 && <Link className="btn sm" href="?tab=orders">Order now</Link>}</div>
            {low.length === 0 ? <div className="empty">Everything is above its par level.</div> : (
              <table><tbody>{low.map((i) => <tr key={i.id}><td>{i.name}</td><td className="r num">{formatQty(i.onHand, i.unit)}</td><td className="r muted small">par {formatQty(i.parLevel, i.unit)}</td></tr>)}</tbody></table>
            )}
          </section>
          <ActionForm endpoint={api} action="autoSoldOut" className="panel stack" okText="Saved">
            <h3>Automatic sold-out</h3>
            <p className="muted small" style={{ margin: 0 }}>When an ingredient runs out, take the items that use it off guests&apos; menus. They come back after a delivery or count. Staff sold-out toggles still work.</p>
            <label className="toggle"><input type="checkbox" name="on" defaultChecked={venue.autoSoldOut} /> Mark items sold out when stock runs out</label>
            <button className="btn sm" style={{ alignSelf: "flex-start" }}>Save</button>
          </ActionForm>
        </div>
      </>
    );
  }

  if (tab === "items") {
    const edit = items.find((i) => i.id === sp.edit);
    body = (
      <>
        <section className="panel stack">
          <h3>Stock items</h3>
          {items.length === 0 ? <div className="empty">No stock items yet. Add your first below.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table>
                <thead><tr><th>Item</th><th>Supplier</th><th>Pack</th><th className="r">Pack price</th><th className="r">On hand</th><th className="r">Value</th><th /></tr></thead>
                <tbody>
                  {items.map((i) => (
                    <tr key={i.id} style={{ opacity: i.active ? 1 : 0.5 }}>
                      <td><b>{i.name}</b><div className="muted small">{i.category}</div></td>
                      <td className="small">{i.supplierName || "—"}</td>
                      <td className="small">{i.packName} of {formatQty(i.packSize, i.unit)}</td>
                      <td className="r num">{eur(i.packCostCents)}</td>
                      <td className="r num">{formatQty(i.onHand, i.unit)} {i.low && <span className="chip warn">Low</span>}</td>
                      <td className="r num">{eur(i.valueCents)}</td>
                      <td className="r"><Link className="btn sm ghost" href={`?tab=items&edit=${i.id}#item`}>Edit</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <div className="two">
          <ActionForm key={edit?.id ?? "new"} endpoint={api} action="item" reset={!edit} okText="Stock item saved">
            <h3 id="item">{edit ? `Edit ${edit.name}` : "Add a stock item"}</h3>
            {edit && <input type="hidden" name="id" value={edit.id} />}
            <div className="two">
              <label className="field">Name<input name="name" required defaultValue={edit?.name} placeholder="Stout keg" /></label>
              <label className="field">Category<input name="category" defaultValue={edit?.category} placeholder="Beer" /></label>
              <label className="field">Measured in
                <select name="unit" defaultValue={edit?.unit ?? "ml"}>
                  <option value="ml">Litres (drinks)</option>
                  <option value="g">Kilos (food by weight)</option>
                  <option value="each">Items (bottles, cans, portions)</option>
                </select>
              </label>
              <label className="field">Supplier
                <select name="supplierId" defaultValue={edit?.supplierId ?? ""}>
                  <option value="">None</option>
                  {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
              <label className="field">Pack name<input name="packName" defaultValue={edit?.packName ?? ""} placeholder="keg, bottle, case" /></label>
              <label className="field">Pack size (L, kg or items)<input name="packSize" inputMode="decimal" required defaultValue={edit ? inUnit(edit.packSize, edit.unit) : ""} placeholder="50" /></label>
              <label className="field">Pack price ex VAT (€)<input name="packCost" inputMode="decimal" required defaultValue={edit ? (edit.packCostCents / 100).toFixed(2) : ""} placeholder="180.00" /></label>
              <label className="field">Reorder below (L, kg or items)<input name="par" inputMode="decimal" defaultValue={edit ? inUnit(edit.parLevel, edit.unit) : ""} placeholder="60" /></label>
            </div>
            {edit && <label className="toggle small"><input type="checkbox" name="active" defaultChecked={edit.active} /> In use</label>}
            <div className="row" style={{ justifyContent: "flex-start" }}>
              <button className="btn">{edit ? "Save" : "Add item"}</button>
              {edit && <Link className="btn ghost" href="?tab=items">Cancel</Link>}
            </div>
          </ActionForm>
          <div className="stack">
            <ActionForm endpoint={api} action="supplier" reset okText="Supplier added">
              <h3>Add a supplier</h3>
              <label className="field">Name<input name="name" required /></label>
              <label className="field">Email for orders<input name="email" type="email" /></label>
              <label className="field">Phone<input name="phone" /></label>
              <button className="btn sm" style={{ alignSelf: "flex-start" }}>Add supplier</button>
            </ActionForm>
            {suppliers.length > 0 && (
              <section className="panel stack">
                <h3>Suppliers</h3>
                <table><tbody>{suppliers.map((s) => <tr key={s.id}><td><b>{s.name}</b></td><td className="small muted">{s.email || "no email"}</td><td className="small muted">{s.phone}</td></tr>)}</tbody></table>
              </section>
            )}
          </div>
        </div>
      </>
    );
  }

  if (tab === "recipes") {
    const rs = await inv.recipes(venue);
    const open = rs.find((r) => r.menuItem.id === sp.edit);
    body = (
      <div className="two">
        <section className="panel stack">
          <h3>Cost and profit per serving</h3>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Menu item</th><th className="r">Price</th><th className="r">Cost</th><th className="r">Profit</th><th className="r">GP</th></tr></thead>
              <tbody>
                {rs.map((r) => (
                  <tr key={r.menuItem.id}>
                    <td><Link href={`?tab=recipes&edit=${r.menuItem.id}`}>{r.menuItem.name}</Link>{!r.hasRecipe && <span className="chip warn" style={{ marginLeft: 6 }}>No recipe</span>}</td>
                    <td className="r num">{eur(r.menuItem.priceCents)}</td>
                    <td className="r num">{r.hasRecipe ? eur(r.costCents) : "—"}</td>
                    <td className="r num">{r.hasRecipe ? eur(r.gpCents) : "—"}</td>
                    <td className="r num">{r.hasRecipe ? <span className={`chip ${r.gpPct >= 70 ? "ok" : r.gpPct >= 60 ? "plain" : "crit"}`}>{r.gpPct}%</span> : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <span className="muted small">Profit is the price excluding VAT, less the cost of the ingredients. Tap an item to edit its recipe.</span>
        </section>
        {open ? (
          <ActionForm key={open.menuItem.id} endpoint={api} action="recipe" okText="Recipe saved">
            <h3>{open.menuItem.name}: one serving uses</h3>
            <input type="hidden" name="menuItemId" value={open.menuItem.id} />
            {items.length === 0 ? <div className="empty">Add stock items first.</div> : (
              <div className="stack" style={{ gap: 6 }}>
                {items.filter((i) => i.active).map((i) => (
                  <label key={i.id} className="row" style={{ gap: 10 }}>
                    <span style={{ flex: 1 }}>{i.name}</span>
                    <input name={`qty:${i.id}`} inputMode="numeric" style={{ width: 90 }} className="field-input" defaultValue={open.lines.find((l) => l.stockItemId === i.id)?.qty ?? ""} placeholder="0" />
                    <span className="muted small" style={{ width: 40 }}>{i.unit}</span>
                  </label>
                ))}
              </div>
            )}
            <span className="muted small">Amounts in ml, g or items. A pint is 568 ml; a measure of spirits is 35.5 ml (enter 36 or 35).</span>
            <button className="btn">Save recipe</button>
          </ActionForm>
        ) : (
          <div className="empty">Choose a menu item to set what one serving uses.</div>
        )}
      </div>
    );
  }

  if (tab === "deliveries") {
    const recent = await inv.recentDeliveries(venue);
    body = (
      <div className="two">
        <ActionForm endpoint={api} action="delivery" reset okText="Delivery recorded">
          <h3>Record a delivery</h3>
          <div className="two">
            <label className="field">Supplier
              <select name="supplierId" defaultValue="">
                <option value="">Other</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
            <label className="field">Invoice or docket number<input name="reference" /></label>
          </div>
          {items.length === 0 ? <div className="empty">Add stock items first.</div> : (
            <table>
              <thead><tr><th>Item</th><th className="r">Packs</th><th className="r">Price per pack (€)</th></tr></thead>
              <tbody>
                {items.filter((i) => i.active).map((i) => (
                  <tr key={i.id}>
                    <td>{i.name}<div className="muted small">{i.packName} of {formatQty(i.packSize, i.unit)}</div></td>
                    <td className="r"><input name={`packs:${i.id}`} inputMode="numeric" style={{ width: 70 }} className="field-input" placeholder="0" /></td>
                    <td className="r"><input name={`price:${i.id}`} inputMode="decimal" style={{ width: 90 }} className="field-input" defaultValue={(i.packCostCents / 100).toFixed(2)} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <span className="muted small">Prices excluding VAT, as on the invoice. They update each item&apos;s cost.</span>
          <button className="btn">Record delivery</button>
        </ActionForm>
        <section className="panel stack">
          <h3>Recent deliveries</h3>
          {recent.length === 0 ? <div className="empty">None yet.</div> : (
            <table><tbody>{recent.map((d) => <tr key={d.id}><td className="small num">{new Date(d.receivedAt).toLocaleDateString("en-IE")}</td><td>{d.supplierName || "Other"}<div className="muted small">{d.reference}</div></td><td className="r num">{eur(d.totalCents)}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    );
  }

  if (tab === "orders") {
    const [suggested, pos] = await Promise.all([inv.suggestedOrders(venue), inv.purchaseOrders(venue)]);
    body = (
      <>
        {suggested.length === 0 ? <div className="empty">Nothing to order: everything is above its par level. Set par levels under Stock items.</div> : suggested.map((g) => (
          <ActionForm key={g.supplier.id} endpoint={api} action="po" okText="Order created">
            <h3>Suggested order: {g.supplier.name}</h3>
            <input type="hidden" name="supplierId" value={g.supplier.id} />
            <table>
              <thead><tr><th>Item</th><th className="r">On hand</th><th className="r">Par</th><th className="r">Packs</th></tr></thead>
              <tbody>{g.lines.map((l) => (
                <tr key={l.item.id}><td>{l.item.name}<div className="muted small">{l.item.packName}, {eur(l.item.packCostCents)}</div></td><td className="r num">{formatQty(l.item.onHand, l.item.unit)}</td><td className="r num">{formatQty(l.item.parLevel, l.item.unit)}</td>
                  <td className="r"><input name={`packs:${l.item.id}`} inputMode="numeric" style={{ width: 70 }} className="field-input" defaultValue={l.packs} /></td></tr>
              ))}</tbody>
            </table>
            <button className="btn sm" style={{ alignSelf: "flex-start" }}>Create order</button>
          </ActionForm>
        ))}
        <section className="panel stack">
          <h3>Orders</h3>
          {pos.length === 0 ? <div className="empty">No supplier orders yet.</div> : (
            <div style={{ overflowX: "auto" }}>
              <table><tbody>{pos.map((p) => (
                <tr key={p.id}>
                  <td className="small num">{new Date(p.createdAt).toLocaleDateString("en-IE")}</td>
                  <td><b>{p.supplier.name}</b><div className="muted small">{p.lines.map((l) => `${l.packs} × ${l.name}`).join(", ")}</div></td>
                  <td className="r num">{eur(p.totalCents)}</td>
                  <td><span className={`chip ${p.status === "received" ? "ok" : p.status === "sent" ? "warn" : "plain"}`}>{{ draft: "Draft", sent: "Sent", received: "Received", cancelled: "Cancelled" }[p.status]}</span></td>
                  <td className="r">
                    <div className="row" style={{ justifyContent: "flex-end" }}>
                      {p.status === "draft" && <ActionForm endpoint={api} action="poSend" className="" okText="Sent"><input type="hidden" name="poId" value={p.id} /><button className="btn sm">{p.supplier.email ? "Email it" : "Mark sent"}</button></ActionForm>}
                      {(p.status === "draft" || p.status === "sent") && <ActionForm endpoint={api} action="poReceive" className="" confirmText="Record this order as delivered, as ordered?"><input type="hidden" name="poId" value={p.id} /><button className="btn sm ghost">Received</button></ActionForm>}
                      {(p.status === "draft" || p.status === "sent") && <ActionForm endpoint={api} action="poCancel" className=""><input type="hidden" name="poId" value={p.id} /><button className="btn sm ghost">Cancel</button></ActionForm>}
                    </div>
                  </td>
                </tr>
              ))}</tbody></table>
            </div>
          )}
        </section>
      </>
    );
  }

  if (tab === "counts") {
    const counts = await inv.recentCounts(venue, 5);
    const last = counts[0];
    body = (
      <div className="two">
        <ActionForm endpoint={api} action="count" reset okText="Count saved">
          <h3>Stock count</h3>
          <p className="muted small" style={{ margin: 0 }}>Count what&apos;s on the shelves, in the cellar and in the kitchen. Leave an item blank to skip it.</p>
          {items.length === 0 ? <div className="empty">Add stock items first.</div> : (
            <table>
              <thead><tr><th>Item</th><th className="r">Expected</th><th className="r">Counted</th></tr></thead>
              <tbody>{items.filter((i) => i.active).map((i) => (
                <tr key={i.id}><td>{i.name}</td><td className="r num muted">{formatQty(i.onHand, i.unit)}</td>
                  <td className="r"><input name={`count:${i.id}`} inputMode="decimal" style={{ width: 80 }} className="field-input" placeholder={COUNT_UNIT[i.unit as StockUnit].label} /> <span className="muted small">{COUNT_UNIT[i.unit as StockUnit].label}</span></td></tr>
              ))}</tbody>
            </table>
          )}
          <button className="btn">Save count</button>
        </ActionForm>
        <section className="panel stack">
          <h3>Last count{last && `: ${new Date(last.countedAt).toLocaleString("en-IE", { dateStyle: "medium", timeStyle: "short" })}`}</h3>
          {!last ? <div className="empty">No counts yet. Your first count sets your opening stock.</div> : (
            <>
              <div className="row"><span>Stock value</span><b className="num">{eur(last.valueCents)}</b></div>
              <div className="row"><span>Unexplained difference</span><b className={`num ${last.varianceCents < 0 ? "neg" : ""}`}>{eur(last.varianceCents)}</b></div>
              <table>
                <thead><tr><th>Item</th><th className="r">Expected</th><th className="r">Counted</th><th className="r">At cost</th></tr></thead>
                <tbody>{last.lines.filter((l) => l.counted !== l.expected).sort((a, b) => a.diffCents - b.diffCents).map((l) => (
                  <tr key={l.stockItemId}><td>{l.name}</td><td className="r num">{formatQty(l.expected, l.unit as StockUnit)}</td><td className="r num">{formatQty(l.counted, l.unit as StockUnit)}</td><td className="r num">{eur(l.diffCents)}</td></tr>
                ))}</tbody>
              </table>
              <span className="muted small">Differences are what the ledger can&apos;t explain after sales, deliveries and logged waste: over-pouring, unrecorded waste or theft.</span>
            </>
          )}
        </section>
      </div>
    );
  }

  if (tab === "waste") {
    const w = await inv.wasteReport(venue, from, to);
    body = (
      <div className="two">
        <div className="stack">
          <ActionForm endpoint={api} action="waste" reset okText="Waste logged">
            <h3>Log waste</h3>
            <div className="two">
              <label className="field">Item
                <select name="stockItemId" required>{items.filter((i) => i.active).map((i) => <option key={i.id} value={i.id}>{i.name} ({COUNT_UNIT[i.unit as StockUnit].label})</option>)}</select>
              </label>
              <label className="field">Amount (L, kg or items)<input name="amount" inputMode="decimal" required /></label>
              <label className="field">Reason<select name="reason">{WASTE_REASONS.map((r) => <option key={r}>{r}</option>)}</select></label>
            </div>
            <button className="btn sm" style={{ alignSelf: "flex-start" }}>Log waste</button>
            <span className="muted small">Bar and kitchen staff can log waste by menu item from their Waste tab.</span>
          </ActionForm>
          <section className="panel stack">
            <h3>Waste by reason, last {days} days: {eur(w.totalCents)}</h3>
            {w.byReason.length === 0 ? <div className="empty">No waste logged.</div> : <table><tbody>{w.byReason.map(([r, c]) => <tr key={r}><td>{r}</td><td className="r num">{eur(c)}</td></tr>)}</tbody></table>}
          </section>
        </div>
        <section className="panel stack">
          <h3>Recent waste</h3>
          {w.recent.length === 0 ? <div className="empty">Nothing yet.</div> : (
            <table><tbody>{w.recent.map((r) => <tr key={r.id}><td className="small num">{new Date(r.at).toLocaleString("en-IE", { dateStyle: "short", timeStyle: "short" })}</td><td>{r.name}<div className="muted small">{r.reason}</div></td><td className="r num">{formatQty(r.qty, r.unit as StockUnit)}</td><td className="r num">{eur(r.costCents)}</td></tr>)}</tbody></table>
          )}
        </section>
      </div>
    );
  }

  if (tab === "till") {
    body = (
      <ActionForm endpoint={api} action="till" reset okText="Imported" style={{ maxWidth: 640 }}>
        <h3>Import counter sales</h3>
        <p className="muted small" style={{ margin: 0 }}>
          App orders take stock out automatically. For drinks and food sold on your till, export the day&apos;s &quot;sales by item&quot; report (Revolut POS, myPOS or any till) as CSV and import it here, so stock and profit include them. Items are matched to your menu by name. Importing the same day again replaces it.
        </p>
        <label className="field">Trading day<input type="date" name="date" required defaultValue={new Date(Date.now() - 86_400_000).toISOString().slice(0, 10)} /></label>
        <label className="field">CSV file<input type="file" name="file" accept=".csv,text/csv,text/plain" required /></label>
        <button className="btn" style={{ alignSelf: "flex-start" }}>Import</button>
      </ActionForm>
    );
  }

  if (tab === "reports") {
    const r = await inv.profitReport(venue, from, to);
    body = (
      <>
        <div className="kpis">
          <div className="panel kpi"><b className="num">{eur(r.totals.netSales)}</b><span>Sales excl. VAT</span></div>
          <div className="panel kpi"><b className="num">{eur(r.totals.cogs)}</b><span>Cost of what was sold</span></div>
          <div className="panel kpi"><b className="num">{eur(r.totals.gp)}</b><span>Gross profit ({r.totals.gpPct}%)</span></div>
          <div className="panel kpi"><b className="num">{eur(r.totals.wasteCents)}</b><span>Logged waste</span></div>
          <div className="panel kpi"><b className="num">{eur(r.totals.varianceCents)}</b><span>Count differences</span></div>
          <div className="panel kpi"><b className="num">{eur(r.totals.profitAfterLosses)}</b><span>Profit after waste and losses</span></div>
        </div>
        {r.totals.missingRecipes > 0 && <div className="notice">{r.totals.missingRecipes} items sold without a recipe, so their cost isn&apos;t counted. <Link href="?tab=recipes">Add recipes</Link></div>}
        <section className="panel stack">
          <div className="row wrap"><h3>Profit by item</h3><span className="muted small">App orders and imported till sales</span></div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Item</th><th className="r">Sold</th><th className="r">Sales ex VAT</th><th className="r">Cost</th><th className="r">Profit</th><th className="r">GP</th><th>Menu</th></tr></thead>
              <tbody>{r.items.filter((i) => i.qty > 0).map((i) => (
                <tr key={i.id}>
                  <td>{i.name}</td><td className="r num">{i.qty}{i.tillQty > 0 && <span className="muted small"> ({i.tillQty} till)</span>}</td>
                  <td className="r num">{eur(i.netCents)}</td><td className="r num">{i.hasRecipe ? eur(i.costCents) : "—"}</td><td className="r num">{eur(i.profitCents)}</td>
                  <td className="r num">{i.hasRecipe ? `${i.gpPct}%` : "—"}</td>
                  <td>{i.hasRecipe && <span className={`chip ${CLASS_CHIP[i.class]}`} title={MENU_CLASS_TEXT[i.class][1]}>{MENU_CLASS_TEXT[i.class][0]}</span>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          {r.items.every((i) => i.qty === 0) && <div className="empty">No sales in this period.</div>}
        </section>
        <section className="panel stack">
          <h3>What the menu groups mean</h3>
          <table><tbody>{(["star", "plowhorse", "puzzle", "dog"] as const).map((c) => <tr key={c}><td><span className={`chip ${CLASS_CHIP[c]}`}>{MENU_CLASS_TEXT[c][0]}</span></td><td className="small">{MENU_CLASS_TEXT[c][1]}</td></tr>)}</tbody></table>
        </section>
      </>
    );
  }

  return (
    <div className="page stack" style={{ maxWidth: 1100 }}>
      <VenueTheme color={venue.brandColor} />
      <div>
        <div className="label">{venue.name}</div>
        <StaffNav setup={venue.status === "setup"} slug={slug} current="stock" admin={staff.role === "admin"} />
        <div className="row wrap">
          <h1 style={{ fontSize: 28 }}>Stock</h1>
          {(tab === "overview" || tab === "waste" || tab === "reports") && (
            <nav className="seg" aria-label="Period">
              <Link href={`?tab=${tab}&p=7d`} aria-current={days === 7 ? "page" : undefined}>7 days</Link>
              <Link href={`?tab=${tab}&p=30d`} aria-current={days === 30 ? "page" : undefined}>30 days</Link>
            </nav>
          )}
        </div>
      </div>
      <nav className="subtabs" aria-label="Stock">
        {TABS.map(([k, l]) => <Link key={k} href={`?tab=${k}`} aria-current={tab === k ? "page" : undefined}>{l}</Link>)}
      </nav>
      {body}
    </div>
  );
}
