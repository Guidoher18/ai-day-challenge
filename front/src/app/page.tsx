import { Chat } from "@/components/Chat";
import { HandoffPanel } from "@/components/HandoffPanel";
import { Header } from "@/components/Header";

export default function Home() {
  return (
    <main className="app">
      <Header />
      <div className="layout">
        <Chat />
        <HandoffPanel />
      </div>
    </main>
  );
}
