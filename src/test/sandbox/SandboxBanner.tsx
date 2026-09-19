import { useEffect, useState } from "react";
import { isSiteSandboxOn, SITE_SANDBOX_EVENT } from "@/services/siteSandbox";
import { useWallet } from "@/hooks/useWallet";

export function SandboxBanner() {
  const { actor } = useWallet();
  const [on, setOn] = useState(false);

  useEffect(() => {
    const sync = () => setOn(isSiteSandboxOn(actor));
    sync();
    window.addEventListener(SITE_SANDBOX_EVENT, sync);
    return () => window.removeEventListener(SITE_SANDBOX_EVENT, sync);
  }, [actor]);

  if (!on) return null;

  return (
    <p className="border-b border-primary/40 bg-primary/10 px-4 py-2 text-center text-xs font-medium text-primary">
      Test data is on. Live chain plus mock launches, insiders, and chat. Turn it off in Admin.
    </p>
  );
}
