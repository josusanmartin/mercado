import { FlaskConical } from "lucide-react";

export function TestnetBanner() {
  return (
    <div role="note" className="bg-tinta text-papel">
      <div className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-xs sm:text-[13px]">
        <FlaskConical className="size-3.5 shrink-0 text-[#f0c36a]" aria-hidden />
        <p className="truncate">
          <strong className="font-semibold">Testnet prototype, not a real financial product.</strong>{" "}
          <span className="opacity-80">Tokens have no value; xMXN is not redeemable for pesos.</span>
        </p>
      </div>
    </div>
  );
}
