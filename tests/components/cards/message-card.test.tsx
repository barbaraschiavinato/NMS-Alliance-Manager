// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageCard, MessageReplyForm } from "@/components/cards/message-card";
import { renderWithLocale } from "../helpers";

describe("MessageCard", () => {
  it("renders a minimal message without optional controls", () => {
    renderWithLocale(
      <ul>
        <MessageCard
          body="Hello there"
          createdAt="2026-01-02T03:04:05.000Z"
          deleteLabel="Delete"
          formattedDate="2 Jan"
          participants="Nova → Vega"
        />
      </ul>,
    );
    expect(screen.getByRole("listitem")).toBeInTheDocument();
    expect(screen.getByRole("article")).not.toHaveClass("message-unread");
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
    expect(screen.getByText("Nova → Vega")).toBeInTheDocument();
    expect(screen.getByText("Hello there")).toBeInTheDocument();
    expect(screen.getByText("2 Jan")).toHaveAttribute("datetime", "2026-01-02T03:04:05.000Z");
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders title, slots, unread state and the delete action", async () => {
    const onDelete = vi.fn();
    const { user } = renderWithLocale(
      <ul>
        <MessageCard
          body="Body"
          createdAt="2026-01-02"
          deleteLabel="Delete message"
          form={<p>form slot</p>}
          formattedDate="today"
          onDelete={onDelete}
          participants="P"
          replies={<p>replies slot</p>}
          subjectActions={<span>subject action</span>}
          thread={<p>thread slot</p>}
          title="Subject"
          toolsAfterDate={<span>tool</span>}
          unread
        />
      </ul>,
    );
    expect(screen.getByRole("article")).toHaveClass("message-unread");
    expect(screen.getByRole("heading", { level: 2, name: "Subject" })).toBeInTheDocument();
    for (const text of ["form slot", "replies slot", "subject action", "thread slot", "tool"])
      expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByText("today").nextElementSibling).toBe(screen.getByText("tool"));
    expect(screen.getByText("tool").nextElementSibling).toBe(screen.getByRole("button", { name: "Delete message" }));
    await user.click(screen.getByRole("button", { name: "Delete message" }));
    expect(screen.getByRole("button", { name: "Delete message" })).toHaveAttribute("data-tooltip", "Delete message");
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("disables delete while deleting", () => {
    renderWithLocale(
      <ul>
        <MessageCard
          body="b"
          createdAt=""
          deleteLabel="Delete"
          deleting
          formattedDate=""
          onDelete={vi.fn()}
          participants=""
        />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Delete" })).toBeDisabled();
  });

  it("toggles collapsed replies", async () => {
    const onToggle = vi.fn();
    const { user, rerender } = renderWithLocale(
      <ul>
        <MessageCard
          body="b"
          createdAt=""
          deleteLabel=""
          formattedDate=""
          participants=""
          toggle={{ count: 3, collapsed: true, onToggle }}
        />
      </ul>,
    );
    const toggle = screen.getByRole("button", { name: "Show 3 replies" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("data-tooltip", "Show 3 replies");
    expect(toggle).toHaveTextContent("3");
    await user.click(toggle);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <ul>
        <MessageCard
          body="b"
          createdAt=""
          deleteLabel=""
          formattedDate=""
          participants=""
          toggle={{ count: 3, collapsed: false, onToggle }}
        />
      </ul>,
    );
    expect(screen.getByRole("button", { name: "Hide 3 replies" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Hide 3 replies" })).toHaveAttribute("data-tooltip", "Hide 3 replies");
  });

  it("offers a reply action, in Italian", async () => {
    const onReply = vi.fn();
    const { user } = renderWithLocale(
      <ul>
        <MessageCard
          body="b"
          createdAt=""
          deleteLabel=""
          formattedDate=""
          onReply={onReply}
          participants=""
          toggle={{ count: 1, collapsed: true, onToggle: vi.fn() }}
        />
      </ul>,
      { locale: "it" },
    );
    expect(screen.getByRole("button", { name: "Mostra 1 risposte" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rispondi" })).toHaveAttribute("data-tooltip", "Rispondi");
    await user.click(screen.getByRole("button", { name: "Rispondi" }));
    expect(onReply).toHaveBeenCalledTimes(1);
  });
});

describe("MessageReplyForm", () => {
  function renderForm(overrides: Partial<Parameters<typeof MessageReplyForm>[0]> = {}, locale: "it" | "en" = "en") {
    const props = {
      subject: "Mission X",
      rows: 3,
      value: "",
      onChange: vi.fn(),
      acknowledged: false,
      onAcknowledgedChange: vi.fn(),
      error: "",
      sending: false,
      onCancel: vi.fn(),
      onSubmit: vi.fn((event: { preventDefault: () => void }) => event.preventDefault()),
      ...overrides,
    };
    return { props, ...renderWithLocale(<MessageReplyForm {...props} />, { locale }) };
  }

  it("labels the reply box with the subject and blocks sending until ready", async () => {
    const { user, props } = renderForm();
    const textarea = screen.getByRole("textbox", { name: "Reply to: Mission X" });
    expect(textarea).toHaveFocus();
    expect(textarea).toHaveAttribute("rows", "3");
    expect(screen.getByRole("button", { name: "Send reply" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Send reply" })).toHaveAttribute("data-tooltip", "Send reply");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveAttribute("data-tooltip", "Cancel");

    await user.type(textarea, "H");
    expect(props.onChange).toHaveBeenCalledWith("H");
    await user.click(screen.getByRole("checkbox", { name: /I confirm this message is only about the mission/ }));
    expect(props.onAcknowledgedChange).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(props.onCancel).toHaveBeenCalledTimes(1);
  });

  it("keeps sending disabled for blank text", () => {
    renderForm({ value: "   ", acknowledged: true });
    expect(screen.getByRole("button", { name: "Send reply" })).toBeDisabled();
  });

  it("keeps sending disabled while sending", () => {
    renderForm({ value: "Hi", acknowledged: true, sending: true });
    expect(screen.getByRole("button", { name: "Send reply" })).toBeDisabled();
  });

  it("submits when text is present and acknowledged", async () => {
    const { user, props } = renderForm({ value: "Hi", acknowledged: true });
    await user.click(screen.getByRole("button", { name: "Send reply" }));
    expect(props.onSubmit).toHaveBeenCalledTimes(1);
  });

  it("shows a translated error, in Italian", () => {
    renderForm({ error: "messages.reply" }, "it");
    expect(screen.getByRole("textbox", { name: "Rispondi a: Mission X" })).toBeInTheDocument();
    expect(screen.getByText("Rispondi", { selector: ".form-error" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Annulla" })).toBeInTheDocument();
  });
});
