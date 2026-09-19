import { alcorSwapUrl, alcorSwapWidgetUrl } from "@/config/launch";

export function AlcorSwapEmbed({
  quoteSymbol,
  quoteContract,
  symbol,
  contract,
}: {
  quoteSymbol: string;
  quoteContract: string;
  symbol: string;
  contract: string;
}) {
  if (!quoteSymbol) {
    return <p className="text-sm text-muted-foreground">Swap appears after the launch pair is on Alcor.</p>;
  }
  const src = alcorSwapWidgetUrl(quoteSymbol, quoteContract, symbol, contract);
  const href = alcorSwapUrl(quoteSymbol, quoteContract, symbol, contract);
  return (
    <>
      <iframe
        title="Alcor swap"
        src={src}
        className="hidden h-[600px] w-full border-0 bg-background lg:block"
        allow="clipboard-write"
      />
      <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full lg:hidden">
        Swap on Alcor
      </a>
    </>
  );
}
