programming_languages: TypeScript, React JSX, CSS (Tailwind utilities)
purpose: Minimal copy-paste XPR Network dApp template — wallet connect + signed actions — for building games and playful on-chain apps (not financial products)
functionality: WebAuth + Anchor multi-login, active signer switch, generic contract action form, skill/ docs for contracts and RPC
inputs: Wallet connect, contract/action/JSON form fields, RPC reads via public endpoints
outputs: Signed transactions on XPR, restored sessions in localStorage, static Vite build
libraries_frameworks: Vite, React 18, react-router-dom, Tailwind (utility classes only), @proton/web-sdk, @proton/link, WharfKit (Anchor)
coding_style_conventions: Prefer native HTML + Tailwind component classes (.btn .input .card); no UI kit; keep wallet services intact; least lines; accurate to goal
error_handling: Surface wallet/tx errors as plain text; fail soft on restore; never invent financial flows
comments_documentation: README = template map + 10 game prompts; skill/ for chain depth; keep Index copy short
performance_considerations: Dynamic-import Proton SDK; no unused providers or Radix/shadcn layers
