// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Pagination, usePagination } from "@/components/shared/pagination";
import { renderWithLocale } from "./helpers";

function List({ count, criteria = "" }: Readonly<{ count: number; criteria?: string }>) {
  const pagination = usePagination(
    Array.from({ length: count }, (_, index) => index + 1),
    50,
    criteria,
  );
  return (
    <>
      <ul>
        {pagination.items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <Pagination {...pagination} />
    </>
  );
}

describe("pagination", () => {
  it.each([0, 1, 50])("does not show controls for %i items", (count) => {
    renderWithLocale(<List count={count} />);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(count);
  });

  it("limits pages to 50, navigates both ways and disables boundary controls", async () => {
    const { user } = renderWithLocale(<List count={101} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(50);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("51")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByText("101")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Next page" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Previous page" }));
    expect(screen.getByText("Page 2 of 3")).toBeInTheDocument();
  });

  it("resets for changed criteria and clamps the page after deletions", async () => {
    const { user, rerender } = renderWithLocale(<List count={101} />);
    await user.click(screen.getByRole("button", { name: "Next page" }));
    rerender(<List count={101} criteria="search" />);
    expect(screen.getByText("Page 1 of 3")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await user.click(screen.getByRole("button", { name: "Next page" }));
    rerender(<List count={51} criteria="search" />);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
    rerender(<List count={100} criteria="search" />);
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();
  });

  it("translates controls into Italian", () => {
    renderWithLocale(<List count={51} />, { locale: "it" });
    expect(screen.getByRole("navigation", { name: "Paginazione" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pagina successiva" })).toBeInTheDocument();
    expect(screen.getByText("Pagina 1 di 2")).toBeInTheDocument();
  });
});
