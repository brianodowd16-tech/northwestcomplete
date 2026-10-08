# Showroom Tour

A Street View–style 360° walkthrough of a shop, built from Insta360 captures.
Visitors walk between panoramas, switch floors on a floor plan, and tap price
tags on products to see the name, price and description and add them to a cart.
The cart hands off to the shop's own checkout.

The pilot is **O'Dowds Carrick** (two floors: stoves, fireplaces, accessories),
in `public/tours/odowds/`. It currently uses **placeholder panoramas and sample
products** until the real captures and the live catalogue are added.

Built with [Photo Sphere Viewer](https://photo-sphere-viewer.js.org) (virtual
tour + markers plugins) and Vite. No backend.

## Run it

```bash
cd showroom-tour
npm install
npm run placeholders   # stand-in panoramas, plans, product images (skips existing files)
npm run dev            # http://localhost:5173
```

Useful URLs:

| URL | What it does |
| --- | --- |
| `/` | Tour from the start node |
| `/?node=g-stoves` | Open at a specific panorama (the URL updates as you walk, so links are shareable) |
| `/?node=g-fireplaces&sku=FP-MRB` | Open a product card directly, e.g. from a social post |
| `/?edit` | Editor: link panoramas, pin products, place nodes on the floor plan |
| `/?tour=other-shop` | Load another tour from `public/tours/other-shop/` |

## Pilot workflow

### 1. Capture (Insta360)

- Use a tripod or monopod at about 1.5 m. Hide behind a display or step out of the room for each shot.
- **Photos** give the best quality. Take one in each spot a customer would stand: entrance, each aisle or display,
  stair bottom, stair top, upstairs landing, each upstairs room. Around 15–25 spots covers a two-floor showroom.
- **Video** gives smooth Street View walking. Walk slowly (about 0.5 m/s) holding the camera above your head, with FlowState/direction lock on.
- In Insta360 Studio, export photos as **equirectangular JPG** and videos as **360 MP4** (the raw `.insp`/`.insv` files are not stitched).
- Turn up the lights and avoid mixing daylight with spotlights, or the stoves look orange.

### 2. Import

```bash
npm run ingest -- --in captures/ground --floor ground --prefix g-
npm run ingest -- --in captures/first  --floor first  --prefix f-
npm run ingest -- --in captures/walk.mp4 --floor ground --every 2   # needs ffmpeg
```

Each capture is resized to 6144 px wide (`--width`), given a thumbnail, and added to `tour.json`.
Video frames come in already chained forward and back. Re-importing a file with `--force`
replaces the image but keeps its links and pins.

### 3. Floor plans

Replace `plans/ground.svg` and `plans/first.svg` with real plans. A phone photo of a sketch works.
Set each floor's `size` in `tour.json` to the image's pixel size.

### 4. Edit at `/?edit`

1. **Place on floor plan**: choose the floor tab, then click where the photo was taken.
2. **Heading**: nudge ±5° until the walk arrows line up with the doorways. Links without a fixed `yaw`
   are worked out from the floor plan positions, so after this step they point the right way.
3. **Links**: pick a panorama and press **Auto** (direction from the plan), or click in the view and press
   **Link here** (fixed direction, best for stairs). Add the return link from the other panorama.
4. **Products**: click on a product in the view, pick it from the list, and press **Pin product**.
   **⤳** moves an existing pin to where you last clicked.
5. **Download tour.json** and replace `public/tours/odowds/tour.json`. Drafts are kept in the browser until then.

Then run `npm run validate`. It reports broken links, unknown SKUs, one-way links and missing files.

### 5. Connect the shop

`public/tours/odowds/products.json` holds the catalogue and the checkout setting.

```bash
npm run sync-catalog -- --shopify https://odowdscarrick.com
# or
npm run sync-catalog -- --woocommerce https://odowdscarrick.com
```

This pulls in real names, prices, descriptions, images, links and stock, and switches checkout to that shop.
Pins point to products by SKU, so pin real SKUs (or re-pin any the script lists as missing).

| `checkout.mode` | What Checkout does |
| --- | --- |
| `demo` | Shows a message. This is the current default. |
| `shopify` | Opens `store/cart/variant:qty,…`, the shop's cart already filled. |
| `woocommerce` | Adds the items through the Store API, then opens `/checkout/`. This needs the tour on the shop's own domain (e.g. `odowdscarrick.com/tour/`). From another domain, only the first item is passed. |
| `link` | Opens each product's page on the website. |
| `enquiry` | Emails `checkout.email` the item list. This suits stoves that need a site survey or fitting. |

If the site uses another platform, or none, use `enquiry` or `link` mode.

### 6. Publish

```bash
npm run build      # outputs dist/
```

`dist/` is static. Upload it to any folder, e.g. `odowdscarrick.com/tour/`, or to Netlify, Cloudflare Pages or S3.
To show it inside an existing page:

```html
<iframe src="https://odowdscarrick.com/tour/" style="width:100%;height:80vh;border:0" allow="fullscreen; gyroscope; accelerometer"></iframe>
```

## Data format

`tour.json`:

```jsonc
{
  "startNodeId": "g-entrance",
  "floors": [{ "id": "ground", "name": "Ground floor", "plan": "plans/ground.svg", "size": [1000, 600] }],
  "nodes": [{
    "id": "g-stoves", "name": "Stove gallery", "floor": "ground",
    "plan": [480, 450],          // position on the floor plan image (px)
    "heading": 0,                // plan bearing the panorama centre faces (0 = up, clockwise)
    "panorama": "panos/g-stoves.jpg", "thumbnail": "thumbs/g-stoves.jpg",
    "links": [{ "nodeId": "g-entrance" }, { "nodeId": "f-landing", "yaw": 0 }],  // yaw optional
    "hotspots": [{ "sku": "STV-MF8", "yaw": 180, "pitch": -12 }]                 // degrees
  }]
}
```

`products.json` products: `sku`, `name`, `price`, `description`, `image`, `url`, `category`,
and optionally `compareAtPrice`, `inStock`, `shopifyVariantId`, `wooProductId`.

## Files

- `src/main.js`: viewer, floor plan, product card, cart drawer
- `src/editor.js`: `?edit` tools
- `src/cart.js`, `src/checkout.js`: cart state and shop handoff
- `src/tour-model.js`: link direction maths and validation (shared with the scripts)
- `scripts/`: `ingest`, `sync-catalog`, `validate-tour`, `make-placeholders`
