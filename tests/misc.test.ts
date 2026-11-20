import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { orderLines } from "@/lib/checkout";
import { parseRangeHtml, slugFromHref } from "@/lib/content";
import { centsToDecimal, minorToCents, toCents } from "@/lib/money";
import { verifyWooWebhook } from "@/lib/webhook";
import type { WooOrder } from "@/lib/woo";

describe("money", () => {
  it("converts between formats", () => {
    expect(toCents("1250.00")).toBe(125000);
    expect(toCents("19.99")).toBe(1999);
    expect(centsToDecimal(5)).toBe("0.05");
    expect(centsToDecimal(-150)).toBe("-1.50");
    expect(minorToCents("3000", 0)).toBe(300000);
    expect(minorToCents("299900", 2)).toBe(299900);
  });
});

describe("orderLines", () => {
  it("includes tax, shipping and fees so lines add up to the total", () => {
    const order = {
      total: "1310.00",
      line_items: [{ id: 1, product_id: 1, name: "Stove", quantity: 2, total: "1000.00", total_tax: "230.00" }],
      shipping_lines: [{ method_title: "Delivery", total: "65.04", total_tax: "14.96" }],
      fee_lines: [],
    } as unknown as WooOrder;
    const { totalCents, items } = orderLines(order);
    expect(totalCents).toBe(131000);
    expect(items.reduce((t, i) => t + i.unitCents * i.quantity, 0)).toBe(131000);
  });
});

describe("verifyWooWebhook", () => {
  it("checks the HMAC", () => {
    const body = '{"id":1}';
    const sig = crypto.createHmac("sha256", "s3cret").update(body).digest("base64");
    expect(verifyWooWebhook(body, sig, "s3cret")).toBe(true);
    expect(verifyWooWebhook(body, sig, "other")).toBe(false);
    expect(verifyWooWebhook(body, null, "s3cret")).toBe(false);
  });
});

describe("content parsing", () => {
  it("normalises old site links", () => {
    expect(slugFromHref("http://www.odowdscarrick.com/riva")).toBe("riva");
    expect(slugFromHref("https://odowdscarrick.com/jotul-f100/")).toBe("jotul-f100");
    expect(slugFromHref("https://example.com/riva")).toBeNull();
  });

  it("groups Elementor image boxes under brand logos", () => {
    const html = `
      <div data-widget_type="image.default"><img src="https://x/logo.jpg"></div>
      <div data-widget_type="text-editor.default"><p>Brand intro</p></div>
      <div data-widget_type="image-box.default"><figure class="elementor-image-box-img"><a href="http://www.odowdscarrick.com/riva"><img src="https://x/riva.png"></a></figure><h3 class="elementor-image-box-title"><a href="http://www.odowdscarrick.com/riva">Riva2 Inset</a></h3></div>
      <div data-widget_type="text-editor.default"><p>Contact Us: Station Road</p></div>`;
    const page = parseRangeHtml("Stoves", html);
    expect(page.groups).toHaveLength(1);
    expect(page.groups[0]).toEqual({ logo: "https://x/logo.jpg", text: ["Brand intro"], items: [{ slug: "riva", title: "Riva2 Inset", image: "https://x/riva.png" }] });
  });
});
