import { MyPosProvider, type MyPosConfig } from "./mypos";
import { MockProvider, RevolutProvider, type PaymentProvider, type RevolutConfig } from "./payments";

/** A venue's payment set-up, decrypted. Stored per venue so each venue is paid into its own account. */
export type PaymentSetup = { provider: "mock" } | ({ provider: "revolut" } & RevolutConfig) | ({ provider: "mypos" } & MyPosConfig);

const g = globalThis as { __roundMock?: MockProvider };

export function buildProvider(setup: PaymentSetup): PaymentProvider {
  if (setup.provider === "mypos") return new MyPosProvider(setup);
  if (setup.provider === "revolut") return new RevolutProvider(setup);
  g.__roundMock ??= new MockProvider();
  return g.__roundMock;
}
