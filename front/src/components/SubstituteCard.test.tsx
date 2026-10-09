import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SubstituteCard } from "./SubstituteCard";

describe("SubstituteCard", () => {
  it("FRONT-CARD-01 renders the substitute's name, role and photo", () => {
    render(<SubstituteCard />);

    expect(screen.getByRole("heading", { level: 2, name: "Roz" })).toBeInTheDocument();
    expect(screen.getByText("Suplente de RR. HH.")).toBeInTheDocument();
    expect(screen.getByText("De guardia")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Foto de Roz, suplente de RR. HH." })).toHaveAttribute("referrerpolicy", "no-referrer");
  });

  it("FRONT-CARD-02 falls back to the 'R' initial when the photo fails to load", () => {
    const { container } = render(<SubstituteCard />);

    fireEvent.error(screen.getByRole("img"));

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    const fallback = container.querySelector('[aria-hidden="true"]');
    expect(fallback).toHaveTextContent(/^R$/);
  });
});
