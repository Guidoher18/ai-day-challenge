import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { TraspasoResponse } from "@/lib/api";
import { HandoffPanel } from "./HandoffPanel";

const mocks = vi.hoisted(() => ({ fetchHandoff: vi.fn() }));

vi.mock("@/lib/api", () => ({ fetchHandoff: mocks.fetchHandoff }));

const handoff: TraspasoResponse = {
  total: 4,
  respondidas: 2,
  ejecutadas: 1,
  escaladas: 1,
  resumen: "Se respondieron **dos** consultas.",
  pendientes: [{ pregunta: "¿Me aprobás un aumento?", fecha: "2026-10-09T14:30:00.000Z" }],
};

function counterValue(label: string) {
  return screen.getByText(label, { selector: "dt" }).nextElementSibling?.textContent;
}

describe("HandoffPanel", () => {
  it("FRONT-HANDOFF-01 shows the hint and does not fetch until the button is clicked", () => {
    render(<HandoffPanel />);

    expect(screen.getByText(/Generá el traspaso para ver/)).toBeInTheDocument();
    expect(mocks.fetchHandoff).not.toHaveBeenCalled();
  });

  it("FRONT-HANDOFF-02 shows a disabled loading button while the handoff is generated", async () => {
    let resolve!: (value: TraspasoResponse) => void;
    mocks.fetchHandoff.mockReturnValue(new Promise<TraspasoResponse>((res) => (resolve = res)));
    const user = userEvent.setup();
    render(<HandoffPanel />);

    await user.click(screen.getByRole("button", { name: "Generar traspaso" }));

    expect(mocks.fetchHandoff).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Generando…" })).toBeDisabled();
    resolve(handoff);
    expect(await screen.findByRole("button", { name: "Generar traspaso" })).toBeEnabled();
  });

  it("FRONT-HANDOFF-03 renders counters, summary and pending items with an es-AR date", async () => {
    mocks.fetchHandoff.mockResolvedValue(handoff);
    const user = userEvent.setup();
    render(<HandoffPanel />);

    await user.click(screen.getByRole("button", { name: "Generar traspaso" }));

    expect(await screen.findByText("Pendientes (1)")).toBeInTheDocument();
    expect(counterValue("Total")).toBe("4");
    expect(counterValue("Respondidas")).toBe("2");
    expect(counterValue("Ejecutadas")).toBe("1");
    expect(counterValue("Escaladas")).toBe("1");
    expect(screen.getByText("dos").tagName).toBe("STRONG");
    expect(screen.getByText("¿Me aprobás un aumento?")).toBeInTheDocument();
    const time = document.querySelector("time");
    expect(time).toHaveAttribute("datetime", "2026-10-09T14:30:00.000Z");
    // TZ is fixed to UTC in vitest.config.mts; es-AR short format is day/month/year.
    const expected = new Intl.DateTimeFormat("es-AR", { dateStyle: "short", timeStyle: "short" }).format(
      new Date(handoff.pendientes[0].fecha),
    );
    expect(time?.textContent).toBe(expected);
    expect(time?.textContent).toMatch(/^9\/10\/26/);
  });

  it("FRONT-HANDOFF-04 shows the raw value when a pending date is not parseable", async () => {
    mocks.fetchHandoff.mockResolvedValue({ ...handoff, pendientes: [{ pregunta: "¿X?", fecha: "ayer" }] });
    const user = userEvent.setup();
    render(<HandoffPanel />);

    await user.click(screen.getByRole("button", { name: "Generar traspaso" }));

    expect(await screen.findByText("ayer")).toBeInTheDocument();
  });

  it("FRONT-HANDOFF-05 shows empty-state texts when there is no summary and nothing pending", async () => {
    mocks.fetchHandoff.mockResolvedValue({ ...handoff, resumen: "", pendientes: [] });
    const user = userEvent.setup();
    render(<HandoffPanel />);

    await user.click(screen.getByRole("button", { name: "Generar traspaso" }));

    expect(await screen.findByText("Sin actividad registrada.")).toBeInTheDocument();
    expect(screen.getByText("No hay consultas pendientes.")).toBeInTheDocument();
    expect(screen.getByText("Pendientes (0)")).toBeInTheDocument();
  });

  it("FRONT-HANDOFF-06 shows the error message when generating the handoff fails", async () => {
    mocks.fetchHandoff.mockRejectedValue(new Error("Error 500 del servidor."));
    const user = userEvent.setup();
    render(<HandoffPanel />);

    await user.click(screen.getByRole("button", { name: "Generar traspaso" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Error 500 del servidor.");
    expect(screen.queryByText(/Generá el traspaso para ver/)).not.toBeInTheDocument();
  });
});
