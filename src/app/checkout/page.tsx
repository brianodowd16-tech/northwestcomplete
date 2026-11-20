import type { Metadata } from "next";
import { CheckoutForm } from "@/components/CheckoutForm";
import { myposConfig } from "@/lib/config";

export const metadata: Metadata = { title: "Checkout", robots: { index: false } };

type Props = { searchParams: Promise<{ payment?: string }> };

export default async function CheckoutPage({ searchParams }: Props) {
  const { payment } = await searchParams;
  let sandbox = true;
  try { sandbox = myposConfig().mode === "sandbox"; } catch {}
  return (
    <div className="wrap">
      <h1 style={{ paddingTop: 40 }}>Checkout</h1>
      {payment === "cancelled" && (
        <p className="alert alert--info">Payment was cancelled and you haven't been charged. Your basket is still here when you're ready.</p>
      )}
      <CheckoutForm sandbox={sandbox} />
    </div>
  );
}
