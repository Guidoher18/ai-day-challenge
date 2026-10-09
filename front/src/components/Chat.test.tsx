import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ConsultaResponse } from "@/lib/api";
import { Chat } from "./Chat";

const mocks = vi.hoisted(() => ({ askQuestion: vi.fn() }));

vi.mock("@/lib/api", () => ({ askQuestion: mocks.askQuestion }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const answered: ConsultaResponse = { respuesta: "Se piden con **15 días**.", ruta: "responder", escalada: false };

function setup() {
  const user = userEvent.setup();
  render(<Chat />);
  return { user, input: screen.getByRole("textbox", { name: "Consulta" }) };
}

beforeEach(() => {
  mocks.askQuestion.mockResolvedValue(answered);
});

describe("Chat", () => {
  it("FRONT-CHAT-01 sends the trimmed question with the send button and renders the answer", async () => {
    const { user, input } = setup();

    await user.type(input, "  ¿Cómo pido vacaciones?  ");
    await user.click(screen.getByRole("button", { name: "Enviar" }));

    expect(mocks.askQuestion).toHaveBeenCalledWith("¿Cómo pido vacaciones?");
    expect(await screen.findByText("15 días")).toBeInTheDocument();
    expect(screen.getByText("¿Cómo pido vacaciones?")).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("FRONT-CHAT-02 sends with Enter", async () => {
    const { user, input } = setup();

    await user.type(input, "Hola{Enter}");

    expect(mocks.askQuestion).toHaveBeenCalledWith("Hola");
  });

  it("FRONT-CHAT-03 inserts a new line with Shift+Enter instead of sending", async () => {
    const { user, input } = setup();

    await user.type(input, "Línea 1{Shift>}{Enter}{/Shift}Línea 2");

    expect(mocks.askQuestion).not.toHaveBeenCalled();
    expect(input).toHaveValue("Línea 1\nLínea 2");
  });

  it("FRONT-CHAT-04 keeps the send button disabled while the input is blank", async () => {
    const { user, input } = setup();

    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await user.type(input, "   ");
    expect(screen.getByRole("button", { name: "Enviar" })).toBeDisabled();
  });

  it("FRONT-CHAT-05 disables sending and shows loading text while a request is pending", async () => {
    const pending = deferred<ConsultaResponse>();
    mocks.askQuestion.mockReturnValue(pending.promise);
    const { user, input } = setup();

    await user.type(input, "Hola{Enter}");

    expect(screen.getByRole("button", { name: "Enviando…" })).toBeDisabled();
    expect(screen.getByText("El suplente está pensando…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "¿Qué reuniones hay mañana?" })).toBeDisabled();

    await user.type(input, "Otra{Enter}");
    expect(mocks.askQuestion).toHaveBeenCalledTimes(1);

    pending.resolve(answered);
    expect(await screen.findByText("15 días")).toBeInTheDocument();
    expect(screen.queryByText("El suplente está pensando…")).not.toBeInTheDocument();
  });

  it("FRONT-CHAT-06 renders the route badge and the escalation marker for escalated answers", async () => {
    mocks.askQuestion.mockResolvedValue({ respuesta: "Quedó pendiente.", ruta: "escalar", escalada: true });
    const { user, input } = setup();

    await user.type(input, "¿Me aprobás un aumento?{Enter}");

    expect(await screen.findByText("Escalada a humano")).toBeInTheDocument();
    expect(screen.getByText("⚑ Escalada")).toBeInTheDocument();
  });

  it("FRONT-CHAT-07 renders the route badge without the escalation marker for non-escalated answers", async () => {
    mocks.askQuestion.mockResolvedValue({ respuesta: "Listo.", ruta: "ejecutar", escalada: false });
    const { user, input } = setup();

    await user.type(input, "¿Qué reuniones hay?{Enter}");

    expect(await screen.findByText("Ejecutada")).toBeInTheDocument();
    expect(screen.queryByText("⚑ Escalada")).not.toBeInTheDocument();
  });

  it("FRONT-CHAT-08 sends an example question when its chip is clicked", async () => {
    const { user } = setup();

    await user.click(screen.getByRole("button", { name: "¿Cómo pido un reintegro de gastos?" }));

    expect(mocks.askQuestion).toHaveBeenCalledWith("¿Cómo pido un reintegro de gastos?");
    expect(await screen.findByText("15 días")).toBeInTheDocument();
  });

  it("FRONT-CHAT-09 shows an error message when the request fails", async () => {
    mocks.askQuestion.mockRejectedValue(new Error("No se pudo conectar con el servidor."));
    const { user, input } = setup();

    await user.type(input, "Hola{Enter}");

    const alert = await screen.findByRole("alert");
    expect(within(alert).getByText("No se pudo procesar la consulta.")).toBeInTheDocument();
    expect(alert).toHaveTextContent("No se pudo conectar con el servidor.");
    expect(screen.getByRole("textbox", { name: "Consulta" })).toBeEnabled();
  });
});
