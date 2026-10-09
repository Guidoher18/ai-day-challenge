import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RichText } from "./RichText";

describe("RichText", () => {
  it("FRONT-RICH-01 renders each line as its own paragraph and blank lines as spacers", () => {
    const { container } = render(<RichText text={"Primera línea\r\n\nSegunda línea"} />);

    const paragraphs = container.querySelectorAll("p");
    expect([...paragraphs].map((p) => p.textContent)).toEqual(["Primera línea", "Segunda línea"]);
    expect(container.firstElementChild?.children).toHaveLength(3);
  });

  it("FRONT-RICH-02 renders **text** as bold", () => {
    render(<RichText text="Esto es **importante** y esto no" />);

    const strong = screen.getByText("importante");
    expect(strong.tagName).toBe("STRONG");
    expect(strong.closest("p")).toHaveTextContent("Esto es importante y esto no");
  });

  it("FRONT-RICH-03 groups consecutive '- ', '* ' and '•' lines into a single list", () => {
    const { container } = render(<RichText text={"Pasos:\n- Uno\n* **Dos**\n• Tres\nFin"} />);

    const lists = container.querySelectorAll("ul");
    expect(lists).toHaveLength(1);
    expect([...lists[0].querySelectorAll("li")].map((li) => li.textContent)).toEqual(["Uno", "Dos", "Tres"]);
    expect(screen.getByText("Dos").tagName).toBe("STRONG");
    expect(screen.getByText("Fin").tagName).toBe("P");
  });

  it("FRONT-RICH-04 renders HTML markup literally instead of injecting it", () => {
    const { container } = render(<RichText text={'<b>x</b><img src="y" onerror="alert(1)">'} />);

    expect(container.querySelector("b")).toBeNull();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("p")).toHaveTextContent('<b>x</b><img src="y" onerror="alert(1)">');
  });
});
