// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import {
  GlyphStrip,
  PortalValidation,
  SystemAddressField,
  type SystemAddressLookup,
} from "@/components/shared/portal-address-field";
import { decodePortalAddress } from "@/lib/missions";
import { renderWithLocale } from "../helpers";

vi.mock("next/image", async () => (await import("../helpers")).nextImageModule);

const validAddress = "0123456789AB";

function ControlledField({
  initial = "",
  galaxy,
  onStateChange = vi.fn(),
  onLookupResolved,
}: Readonly<{
  initial?: string;
  galaxy?: number;
  onStateChange?: Parameters<typeof SystemAddressField>[0]["onStateChange"];
  onLookupResolved?: (lookup: SystemAddressLookup) => void;
}>) {
  const [address, setAddress] = useState(initial);
  return (
    <SystemAddressField
      address={address}
      galaxy={galaxy}
      onChange={setAddress}
      onLookupResolved={onLookupResolved}
      onStateChange={onStateChange}
    />
  );
}

function stubFetchJson(body: unknown, init: ResponseInit = {}) {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("GlyphStrip", () => {
  it("shows one glyph image per entered character in twelve slots", () => {
    const { container } = renderWithLocale(<GlyphStrip address="0A1" />);
    expect(screen.getByLabelText("Glyphs entered: 3 of 12")).toBeInTheDocument();
    const images = container.querySelectorAll("img");
    expect([...images].map((image) => image.getAttribute("src"))).toEqual([
      "/glyphs/glyph-mask-0.png",
      "/glyphs/glyph-mask-A.png",
      "/glyphs/glyph-mask-1.png",
    ]);
    expect(container.querySelectorAll(".glyph-slot")).toHaveLength(12);
  });

  it("uses the Italian label and large size", () => {
    const { container } = renderWithLocale(<GlyphStrip address={validAddress} large />, { locale: "it" });
    expect(screen.getByLabelText("Glifi inseriti: 12 su 12")).toBeInTheDocument();
    expect(container.querySelector("img")).toHaveAttribute("width", "24");
  });
});

describe("PortalValidation", () => {
  it("asks for a complete address when empty and hides the breakdown", () => {
    renderWithLocale(<PortalValidation address="" decoded={null} lookup={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Enter a complete 12-glyph portal address");
    expect(screen.queryByRole("group", { name: "Five-part progress" })).not.toBeInTheDocument();
  });

  it("reports an incomplete code with partial progress bars", () => {
    renderWithLocale(<PortalValidation address="0123" decoded={null} lookup={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Incomplete code · 4 of 12 glyphs");
    expect(screen.getByRole("progressbar", { name: "PLANET" })).toHaveAttribute("aria-valuenow", "1");
    expect(screen.getByRole("progressbar", { name: "SYSTEM" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByRole("progressbar", { name: "Y" })).toHaveAttribute("aria-valuenow", "0");
  });

  it("confirms a valid decoded portal", () => {
    renderWithLocale(
      <PortalValidation address={validAddress} decoded={decodePortalAddress(validAddress)} lookup={null} />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Valid portal · address decoded");
    expect(screen.getAllByRole("progressbar")).toHaveLength(5);
  });

  it("lists decode errors and marks the invalid part", () => {
    const address = "7123456789AB";
    renderWithLocale(<PortalValidation address={address} decoded={decodePortalAddress(address)} lookup={null} />);
    expect(screen.getByRole("status")).toHaveTextContent("Planet index 7: allowed range is 0–6.");
    expect(screen.getByRole("progressbar", { name: "PLANET" })).toHaveClass("portal-decode-invalid");
    expect(screen.getByRole("progressbar", { name: "SYSTEM" })).toHaveClass("portal-decode-valid");
  });

  it("translates decode errors to Italian", () => {
    const address = "7123456789AB";
    renderWithLocale(<PortalValidation address={address} decoded={decodePortalAddress(address)} lookup={null} />, {
      locale: "it",
    });
    expect(screen.getByRole("status")).toHaveTextContent("Indice pianeta 7: ammessi da 0 a 6.");
  });

  it.each([
    ["checking", "Checking NMS Almanac in progress…"],
    ["not-found", "No planet registered with NMS Almanac; it may still exist in the game."],
    ["unavailable", "NMS Almanac error: service unavailable or request limit reached."],
  ] as const)("appends the %s lookup status", (status, text) => {
    renderWithLocale(
      <PortalValidation
        address={validAddress}
        decoded={decodePortalAddress(validAddress)}
        lookup={{ address: validAddress, galaxy: 0, status }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(text);
    expect(screen.queryByRole("link", { name: "NMS Almanac" })).not.toBeInTheDocument();
  });

  it("links to NMS Almanac when the planet was found", () => {
    renderWithLocale(
      <PortalValidation
        address={validAddress}
        decoded={decodePortalAddress(validAddress)}
        lookup={{ address: validAddress, galaxy: 0, status: "found" }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Planet found on");
    expect(screen.getByRole("link", { name: "NMS Almanac" })).toHaveAttribute("href", "https://nmsalmanac.com");
  });

  it("fills every progress bar when the Almanac does not know the address", () => {
    renderWithLocale(
      <PortalValidation
        address={validAddress}
        decoded={decodePortalAddress(validAddress)}
        lookup={{ address: validAddress, galaxy: 0, status: "not-found" }}
      />,
    );
    expect(screen.getByRole("progressbar", { name: "Z" })).toHaveAttribute("aria-valuenow", "3");
    expect(screen.getByRole("progressbar", { name: "Z" })).toHaveClass("portal-decode-incomplete");
  });

  it("ignores a lookup for a different address", () => {
    renderWithLocale(
      <PortalValidation
        address={validAddress}
        decoded={decodePortalAddress(validAddress)}
        lookup={{ address: "111111111111", galaxy: 0, status: "found" }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(/^Valid portal · address decoded$/);
  });
});

describe("SystemAddressField", () => {
  it("normalises typed input to uppercase hex and limits it to 12 glyphs", async () => {
    const { user } = renderWithLocale(<ControlledField />);
    const input = screen.getByRole("textbox", { name: "12-glyph portal address" });
    expect(input).toBeInvalid();

    await user.type(input, "0-z1g23456789abcdef");

    expect(input).toHaveValue(validAddress);
    expect(screen.getByText("12/12")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-invalid", "false");
  });

  it("builds the address from the keypad and edits it with the buttons", async () => {
    const { user } = renderWithLocale(<ControlledField />);
    const removeLast = screen.getByRole("button", { name: "Remove last glyph" });
    const clear = screen.getByRole("button", { name: "Clear address" });
    expect(removeLast).toBeDisabled();
    expect(clear).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Enter glyph A" }));
    await user.click(screen.getByRole("button", { name: "Enter glyph 3" }));
    expect(screen.getByRole("textbox")).toHaveValue("A3");

    await user.click(removeLast);
    expect(screen.getByRole("textbox")).toHaveValue("A");

    await user.click(clear);
    expect(screen.getByRole("textbox")).toHaveValue("");
  });

  it("disables the keypad once 12 glyphs are entered", () => {
    renderWithLocale(<ControlledField initial={validAddress} />);
    expect(screen.getByRole("button", { name: "Enter glyph F" })).toBeDisabled();
    expect(screen.getAllByRole("button", { name: /^Enter glyph/ })).toHaveLength(16);
  });

  it("does not query the Almanac without a galaxy", () => {
    const fetchMock = stubFetchJson({ found: true });
    const onStateChange = vi.fn();
    renderWithLocale(<ControlledField initial={validAddress} onStateChange={onStateChange} />);
    expect(onStateChange).toHaveBeenLastCalledWith({ valid: true, lookup: null });
    expect(screen.getByRole("status")).toHaveTextContent(/^Valid portal · address decoded$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies a valid address and reports the found planet", async () => {
    const fetchMock = stubFetchJson({ found: true, systemLabel: "Alpha", planetType: "Lush" });
    const onStateChange = vi.fn();
    const onLookupResolved = vi.fn();
    renderWithLocale(
      <ControlledField
        galaxy={2}
        initial={validAddress}
        onLookupResolved={onLookupResolved}
        onStateChange={onStateChange}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Checking NMS Almanac in progress…");

    expect(await screen.findByRole("link", { name: "NMS Almanac" })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/missions/verify-system?address=0123456789AB&galaxy=2",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    const lookup = { address: validAddress, galaxy: 2, status: "found", systemLabel: "Alpha", planetType: "Lush" };
    expect(onLookupResolved).toHaveBeenCalledWith(lookup);
    await waitFor(() => expect(onStateChange).toHaveBeenLastCalledWith({ valid: true, lookup }));
  });

  it("reports an address unknown to the Almanac", async () => {
    stubFetchJson({ found: false });
    const onLookupResolved = vi.fn();
    renderWithLocale(<ControlledField galaxy={0} initial={validAddress} onLookupResolved={onLookupResolved} />);
    expect(await screen.findByText(/No planet registered with NMS Almanac/)).toBeInTheDocument();
    expect(onLookupResolved).toHaveBeenCalledWith({
      address: validAddress,
      galaxy: 0,
      status: "not-found",
      systemLabel: null,
      planetType: null,
    });
  });

  it.each([
    ["an error status", () => stubFetchJson({ error: "nope" }, { status: 500 })],
    ["a malformed body", () => stubFetchJson({ found: "yes" })],
    [
      "a network failure",
      () =>
        vi.stubGlobal(
          "fetch",
          vi.fn(async () => {
            throw new Error("offline");
          }),
        ),
    ],
  ])("treats %s as an unavailable Almanac", async (_label, stub) => {
    stub();
    const onLookupResolved = vi.fn();
    renderWithLocale(<ControlledField galaxy={0} initial={validAddress} onLookupResolved={onLookupResolved} />);
    expect(await screen.findByText(/NMS Almanac error: service unavailable/)).toBeInTheDocument();
    expect(onLookupResolved).toHaveBeenCalledWith({ address: validAddress, galaxy: 0, status: "unavailable" });
  });

  it("drops a lookup aborted because the field unmounted", async () => {
    const fetchMock = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onLookupResolved = vi.fn();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = renderWithLocale(
      <ControlledField galaxy={0} initial={validAddress} onLookupResolved={onLookupResolved} />,
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    unmount();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(onLookupResolved).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("does not query the Almanac for an invalid address", async () => {
    const fetchMock = stubFetchJson({ found: true });
    const onStateChange = vi.fn();
    renderWithLocale(<ControlledField galaxy={0} initial="7123456789AB" onStateChange={onStateChange} />);
    expect(onStateChange).toHaveBeenLastCalledWith({ valid: false, lookup: null });
    await new Promise((resolve) => setTimeout(resolve, 400));
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
