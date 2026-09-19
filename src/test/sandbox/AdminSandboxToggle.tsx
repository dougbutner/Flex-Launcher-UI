import { isSiteSandboxOn, setSiteSandboxOn } from "@/services/siteSandbox";
import { useWallet } from "@/hooks/useWallet";

export function AdminSandboxToggle() {
  const { actor } = useWallet();
  const on = isSiteSandboxOn(actor);

  const toggle = () => {
    setSiteSandboxOn(!on, actor);
    window.location.reload();
  };

  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-sm font-semibold">Site sandbox</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Stored mock launches, insiders, chat, and calendar events sit on top of live chain data. Only this browser
        session, and only while signed in as <span className="font-mono">{actor}</span>.
      </p>
      <button type="button" className={on ? "btn btn-outline btn-sm mt-3" : "btn btn-primary btn-sm mt-3"} onClick={toggle}>
        {on ? "Hide test data across site" : "Show test data across site"}
      </button>
    </div>
  );
}
