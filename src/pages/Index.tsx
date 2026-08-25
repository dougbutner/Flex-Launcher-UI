import { Header } from "@/components/Header";
import { TransactionForm } from "@/components/TransactionForm";
import { useProton } from "@/hooks/useProton";

const Index = () => {
  const {
    actor,
    isLoggedIn,
    loading,
    wallets,
    activeId,
    addWebAuthWallet,
    addAnchorWallet,
    setActive,
    removeWallet,
    disconnectAll,
    transact,
  } = useProton();

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        actor={actor}
        isLoggedIn={isLoggedIn}
        loading={loading}
        wallets={wallets}
        activeId={activeId}
        onAddWebAuth={addWebAuthWallet}
        onAddAnchor={addAnchorWallet}
        onSetActive={setActive}
        onRemoveWallet={removeWallet}
        onDisconnectAll={disconnectAll}
      />

      <main className="flex flex-1 flex-col items-center justify-center gap-8 p-6">
        <div className="max-w-md text-center">
          <h2 className="text-3xl font-bold">XPR Network game template</h2>
          <p className="mt-2 text-muted-foreground">
            Vanilla shell: connect WebAuth or Anchor, keep several accounts, switch the active signer, and push
            contract actions. Copy this repo, then build a game on top—scores, turns, collectibles, rooms—using{" "}
            <span className="text-foreground/90">skill/</span> and the prompts in <span className="text-foreground/90">README.md</span>.
          </p>
        </div>

        <TransactionForm onTransact={transact} isLoggedIn={isLoggedIn} />
      </main>

      <footer className="border-t px-6 py-4 text-center text-sm text-muted-foreground">
        <p>
          Template by{" "}
          <a
            href="https://flex.report"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            EASY / Flextokens
          </a>
          . Built on XPR Network Web SDK.
        </p>
      </footer>
    </div>
  );
};

export default Index;
