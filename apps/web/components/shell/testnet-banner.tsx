import { FlaskConical } from "lucide-react";

// SPEC §6: these disclosures must stay readable at every width, so the banner wraps instead of truncating.
export function TestnetBanner() {
  return (
    <div role="note" className="bg-tinta text-papel">
      <div className="mx-auto flex max-w-7xl items-start gap-2 px-4 py-1.5 text-xs leading-snug sm:items-center sm:text-[13px]">
        <FlaskConical className="mt-px size-3.5 shrink-0 text-[#f0c36a] sm:mt-0" aria-hidden />
        <p className="text-pretty">
          <strong className="font-semibold">Testnet prototype, not a real financial product.</strong>{" "}
          <span className="opacity-85">
            Tokens have no value. Collateral is testnet OUSD; xMXN is not redeemable for pesos.
          </span>
        </p>
      </div>
    </div>
  );
}
