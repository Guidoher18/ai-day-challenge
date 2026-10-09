import { Chat } from "@/components/Chat";
import { HandoffPanel } from "@/components/HandoffPanel";
import { Header } from "@/components/Header";
import { SubstituteCard } from "@/components/SubstituteCard";

export default function Home() {
  return (
    <main className="app">
      <Header />
      <div className="layout">
        <Chat />
        <div className="sidebar">
          <SubstituteCard />
          <HandoffPanel />
        </div>
      </div>
    </main>
  );
}
