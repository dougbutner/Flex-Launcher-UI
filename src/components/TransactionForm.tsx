import { useState } from "react";

interface TransactionFormProps {
  onTransact: (actions: Array<{ account: string; name: string; data: Record<string, unknown> }>) => Promise<{ processed?: { id?: string } } | undefined>;
  isLoggedIn: boolean;
}

export function TransactionForm({ onTransact, isLoggedIn }: TransactionFormProps) {
  const [contract, setContract] = useState("");
  const [action, setAction] = useState("");
  const [data, setData] = useState("{}");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResult(null);

    let parsedData: Record<string, unknown>;
    try {
      parsedData = JSON.parse(data);
    } catch {
      setResult({ success: false, message: "Invalid JSON in action data." });
      return;
    }

    if (!contract.trim() || !action.trim()) {
      setResult({ success: false, message: "Contract and action name are required." });
      return;
    }

    setSubmitting(true);
    try {
      const txResult = await onTransact([
        { account: contract.trim(), name: action.trim(), data: parsedData },
      ]);
      setResult({
        success: true,
        message: `Transaction successful! ID: ${txResult?.processed?.id?.slice(0, 12) ?? "OK"}…`,
      });
    } catch (err: unknown) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : "Transaction failed.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="card w-full max-w-lg p-6">
      <h2 className="text-lg font-semibold">Push Transaction</h2>
      <p className="mt-1 text-sm text-muted-foreground">Send an action to any XPR Network smart contract.</p>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label className="block space-y-2">
          <span className="text-sm font-medium">Contract Account</span>
          <input
            className="input"
            placeholder="e.g. eosio.token"
            value={contract}
            onChange={(e) => setContract(e.target.value)}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Action Name</span>
          <input
            className="input"
            placeholder="e.g. transfer"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          />
        </label>

        <label className="block space-y-2">
          <span className="text-sm font-medium">Action Data (JSON)</span>
          <textarea
            className="input min-h-[120px] font-mono text-sm"
            placeholder='{"from":"myaccount","to":"other","quantity":"1.0000 XPR","memo":"hello"}'
            value={data}
            onChange={(e) => setData(e.target.value)}
            rows={5}
          />
        </label>

        {result && (
          <p className={`rounded-md p-3 text-sm ${result.success ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
            {result.message}
          </p>
        )}

        <button type="submit" className="btn btn-primary w-full" disabled={!isLoggedIn || submitting}>
          {submitting ? "Sending…" : !isLoggedIn ? "Connect Wallet First" : "Send Transaction"}
        </button>
      </form>
    </section>
  );
}
