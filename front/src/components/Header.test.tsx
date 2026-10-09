import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Header } from "./Header";

const mocks = vi.hoisted(() => ({ checkHealth: vi.fn() }));

vi.mock("@/lib/api", () => ({ checkHealth: mocks.checkHealth }));

describe("Header", () => {
  it("FRONT-HEADER-01 shows 'checking' first and 'online' when the health probe succeeds", async () => {
    mocks.checkHealth.mockResolvedValue(true);

    render(<Header />);

    expect(screen.getByRole("heading", { level: 1, name: "Suplente digital" })).toBeInTheDocument();
    expect(screen.getByText("Verificando…")).toBeInTheDocument();
    expect(await screen.findByText("Backend en línea")).toBeInTheDocument();
    expect(mocks.checkHealth).toHaveBeenCalledTimes(1);
  });

  it("FRONT-HEADER-02 shows 'offline' when the health probe fails", async () => {
    mocks.checkHealth.mockResolvedValue(false);

    render(<Header />);

    expect(await screen.findByText("Backend fuera de línea")).toBeInTheDocument();
  });
});
