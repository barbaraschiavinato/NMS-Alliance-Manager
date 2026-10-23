// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, screen } from "@testing-library/react";
import { Toast } from "@/components/shared/toast";
import { renderWithLocale } from "./helpers";

afterEach(() => {
  vi.useRealTimers();
});

describe("Toast", () => {
  it("announces success politely, translates the message and closes on request", async () => {
    const onClose = vi.fn();
    const { user } = renderWithLocale(<Toast message="User approved." onClose={onClose} />, { locale: "it" });
    expect(screen.getByRole("status")).toHaveTextContent("Utente approvato.");
    await user.click(screen.getByRole("button", { name: "Chiudi notifica" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("announces errors as alerts with the error style", () => {
    renderWithLocale(<Toast message="Update failed." onClose={vi.fn()} tone="error" />);
    expect(screen.getByRole("alert")).toHaveClass("toast", "toast-error");
    expect(screen.getByRole("alert")).toHaveTextContent("Update failed.");
  });

  it("closes automatically only when requested", () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { unmount } = renderWithLocale(<Toast message="User approved." onClose={onClose} />);
    act(() => vi.advanceTimersByTime(60000));
    expect(onClose).not.toHaveBeenCalled();
    unmount();
    const timed = renderWithLocale(<Toast autoCloseMs={5000} message="User approved." onClose={onClose} />);
    act(() => vi.advanceTimersByTime(4999));
    expect(onClose).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(onClose).toHaveBeenCalledOnce();
    timed.unmount();
    renderWithLocale(<Toast autoCloseMs={5000} message="User approved." onClose={onClose} />).unmount();
    act(() => vi.advanceTimersByTime(10000));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
