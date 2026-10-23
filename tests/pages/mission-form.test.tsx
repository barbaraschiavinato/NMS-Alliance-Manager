// @vitest-environment jsdom
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MissionForm } from "@/components/modals/mission-form";
import { makeMember } from "../helpers/members";
import type { Mission } from "@/lib/missions/missions";
import { json, makeMission, mockFetch, renderPage, t } from "./helpers";

vi.mock("next/image", async () => (await import("./helpers")).nextImageModule);
// Il nome generato si può sostituire per singolo test (es. "" quando nms-core non trova un nome).
const generatedName = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("@/lib/nms-core/system.js", async () => {
  const core = (await import("./helpers")).nmsCoreModule;
  return { ...core, systemName: () => generatedName.value ?? core.systemName() };
});

type FormProps = Parameters<typeof MissionForm>[0];

function renderForm(props: Partial<FormProps> = {}) {
  const handlers = {
    onClose: vi.fn(),
    onSave: vi.fn(async () => undefined),
    onDelete: vi.fn(async () => undefined),
  };
  const view = renderPage(<MissionForm members={[]} mission={null} stationOwners={[]} {...handlers} {...props} />);
  return { ...view, ...handlers, dialog: screen.getByRole("dialog") };
}

afterEach(() => {
  vi.unstubAllGlobals();
  generatedName.value = undefined;
});

describe("MissionForm", () => {
  it("keeps submit disabled until the portal address is valid and checked", async () => {
    mockFetch({
      "/api/missions/verify-system": { found: true, systemLabel: "Euclid Prime" },
      "GET /api/planet-status": { systemStatuses: [] },
    });
    const { user, dialog, onSave, onClose } = renderForm();
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    expect(create).toBeDisabled();

    // Un submit forzato con l'indirizzo vuoto mostra l'errore di validazione.
    fireEvent.submit(dialog.querySelector("form")!);
    expect(
      await within(dialog).findByText(t("stations.enter_a_valid_system_or_portal_code_before_saving")),
    ).toBeInTheDocument();

    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    expect(within(dialog).getByDisplayValue("Testara System")).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue("Euclid Prime")).toBeInTheDocument();

    await user.type(within(dialog).getByRole("textbox", { name: t("missions.mission_notes") }), "Bring a ship");
    await user.click(create);

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        systemAddress: "1234567890AB",
        title: "Testara System",
        system: "Euclid Prime",
        systemVerified: true,
        systemLabelFromAlmanac: true,
        notes: "Bring a ship",
        targetSpecialty: "explorer",
      }),
    );
  });

  it("shows the save error and stays open", async () => {
    mockFetch({ "/api/missions/verify-system": { found: false }, "GET /api/planet-status": { systemStatuses: [] } });
    const { user, dialog, onClose } = renderForm({
      onSave: vi.fn(async () => {
        throw new Error("Duplicate mission.");
      }),
    });

    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);

    expect(await within(dialog).findByText("Duplicate mission.")).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("drops progress for missions without a single specialty", async () => {
    mockFetch({ "/api/missions/verify-system": { found: false }, "GET /api/planet-status": { systemStatuses: [] } });
    const onSave = vi.fn(async () => undefined);
    const { user, dialog } = renderForm({
      onSave,
      initialValues: { title: "Everyone", targetSpecialty: "all", progress: 40 },
    });

    expect(within(dialog).queryByRole("slider")).not.toBeInTheDocument();
    await user.type(
      within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") }),
      "1234567890AB",
    );
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Everyone", targetSpecialty: "all", progress: 0 }),
    );
  });

  it("loads and toggles the shared planet tasks when editing", async () => {
    const mission = makeMission({ id: "m-1", title: "Edit me", targetSpecialty: "explorer", progress: 0 });
    const onSystemStatusesSaved = vi.fn();
    const { requests } = mockFetch({
      "/api/missions/verify-system": { found: true },
      "GET /api/planet-status": { systemStatuses: ["mapped"] },
      "PATCH /api/planet-status": { systemStatuses: ["mapped", "planets_classified"] },
    });
    const { user, dialog } = renderForm({ mission, onSystemStatusesSaved });

    expect(within(dialog).getByRole("heading", { name: t("missions.edit_mission") })).toBeInTheDocument();
    const mapped = await within(dialog).findByRole("checkbox", { name: t("mapped") });
    await waitFor(() => expect(mapped).toBeChecked());
    // La missione senza avanzamento parte dal minimo calcolato dalle voci spuntate.
    expect(within(dialog).getByText("27%")).toBeInTheDocument();

    const classified = within(dialog).getByRole("checkbox", { name: t("planets_classified") });
    await waitFor(() => expect(classified).toBeEnabled(), { timeout: 2000 });
    await user.click(classified);

    await waitFor(() =>
      expect(onSystemStatusesSaved).toHaveBeenCalledWith("1234567890AB", 0, ["mapped", "planets_classified"]),
    );
    expect(requests("PATCH", "/api/planet-status")[0].body).toEqual({
      portal: "1234567890AB",
      galaxy: 0,
      systemStatuses: ["mapped", "planets_classified"],
    });
    expect(classified).toBeChecked();
  });

  it("shows planet task load and save errors", async () => {
    mockFetch({
      "/api/missions/verify-system": { found: true },
      "GET /api/planet-status": json({ error: "Status store offline." }, 503),
    });
    const { dialog } = renderForm({ mission: makeMission() });

    expect(await within(dialog).findByText("Status store offline.")).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: t("mapped") })).not.toBeInTheDocument();
  });

  it("reports a failed planet task save", async () => {
    mockFetch({
      "/api/missions/verify-system": { found: true },
      "GET /api/planet-status": { systemStatuses: [] },
      "PATCH /api/planet-status": json({ error: "Read only." }, 403),
    });
    const { user, dialog } = renderForm({ mission: makeMission() });

    const mapped = await within(dialog).findByRole("checkbox", { name: t("mapped") });
    await waitFor(() => expect(mapped).toBeEnabled(), { timeout: 2000 });
    await user.click(mapped);

    expect(await within(dialog).findByText("Read only.")).toBeInTheDocument();
    expect(mapped).not.toBeChecked();
  });

  it("shows only the role tasks in the simplified form", async () => {
    mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": { systemStatuses: [] } });
    const { dialog } = renderForm({ mission: makeMission(), simplified: true, simplifiedStatusRole: "ranger" });

    expect(await within(dialog).findByRole("checkbox", { name: t("station_claimed") })).toBeInTheDocument();
    expect(within(dialog).queryByRole("checkbox", { name: t("mapped") })).not.toBeInTheDocument();
  });

  it("assigns a member, picks the station discoverer and disables covered specialties", async () => {
    mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": { systemStatuses: [] } });
    const assignee = makeMember({
      publicId: "assignee-1",
      nmsName: "Helper",
      specialty: "builder",
      nmsCode: "ABCDEFGHJKLMN",
      platforms: ["PC", "Xbox"],
    });
    const onSave = vi.fn(async () => undefined);
    const existing = makeMission({ id: "other", targetSpecialty: "builder" });
    const { user, dialog } = renderForm({
      onSave,
      members: [assignee],
      existingMissions: [existing],
      initialValues: { systemAddress: "1234567890AB", title: "Seeded" },
      stationOwners: [{ portal: "1234567890AB", galaxy: 0, ownerId: "owner-1", ownerName: "Discoverer" }],
    });

    const specialty = within(dialog).getByRole("combobox", { name: t("missions.mission_for") });
    expect(within(specialty).getByRole("option", { name: t("common.builders") })).toBeDisabled();
    expect(within(specialty).getByRole("option", { name: t("common.all") })).toBeDisabled();
    await user.selectOptions(specialty, "ranger");

    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: t("missions.system_discoverer") }),
      "owner-1",
    );
    const assign = within(dialog).getByRole("combobox", { name: t("common.assign_to") });
    expect(
      within(assign).getByRole("option", { name: `Helper · ${t("common.builder")} · ABCDEFGHJKLMN · PC, Xbox` }),
    ).toBeInTheDocument();
    await user.selectOptions(assign, "assignee-1");
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: t("missions.priority_field_label") }),
      "urgent",
    );
    await user.selectOptions(
      within(dialog).getByRole("combobox", { name: t("common.status_field_label") }),
      "in_progress",
    );
    fireEvent.change(within(dialog).getByRole("slider"), { target: { value: "35" } });

    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        targetSpecialty: "ranger",
        stationOwnerMemberId: "owner-1",
        assignedMemberId: "assignee-1",
        assignedTo: "Helper",
        priority: "urgent",
        status: "in_progress",
        progress: 35,
      }),
    );
  });

  it("clears the address-dependent fields when the galaxy changes", async () => {
    mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": { systemStatuses: [] } });
    const { user, dialog } = renderForm({
      initialValues: { systemAddress: "1234567890AB", stationOwnerMemberId: "owner-1", stationOwnerName: "Old owner" },
    });

    const discoverer = within(dialog).getByRole("combobox", { name: t("missions.system_discoverer") });
    expect(discoverer).toHaveValue("owner-1");
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t("stations.galaxy") }), "1");
    expect(discoverer).toHaveValue("");
  });

  it("deletes the mission after confirmation and reports failures", async () => {
    mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": { systemStatuses: [] } });
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const onDelete = vi.fn().mockRejectedValueOnce(new Error("Cannot delete.")).mockResolvedValueOnce(undefined);
    const { user, dialog, onClose } = renderForm({ mission: makeMission({ id: "m-9", title: "Remove me" }), onDelete });

    const remove = within(dialog).getByRole("button", { name: t("common.delete") });
    await user.click(remove);
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(remove);
    expect(await within(dialog).findByText("Cannot delete.")).toBeInTheDocument();

    await user.click(remove);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onDelete).toHaveBeenLastCalledWith("m-9");
    expect(confirm).toHaveBeenCalledWith(t("common.delete_title", { title: "Remove me" }));
  });

  it("closes from the close and cancel buttons", async () => {
    mockFetch({});
    const { user, dialog, onClose } = renderForm();

    await user.click(within(dialog).getByRole("button", { name: t("common.close") }));
    await user.click(within(dialog).getByRole("button", { name: t("common.cancel") }));
    expect(onClose).toHaveBeenCalledTimes(2);
  });
  it("tolerates legacy missions without address, galaxy and notes", async () => {
    mockFetch({});
    const legacy = { ...makeMission(), systemAddress: undefined, galaxy: undefined, notes: undefined };
    const { dialog } = renderForm({ mission: legacy as unknown as Mission, hideAddress: true, minimal: true });

    expect(within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") })).toHaveValue("");
    expect(within(dialog).getByRole("combobox", { name: t("stations.galaxy") })).toHaveValue("0");
    expect(within(dialog).getByRole("textbox", { name: t("missions.mission_notes") })).toHaveValue("");
    expect(dialog.querySelector("form")).toHaveClass("mission-form-hide-address", "mission-form-minimal");
    expect(dialog.querySelector("form")).not.toHaveClass("mission-form-simplified");
  });

  it("saves the edited title, objective and system label", async () => {
    // Hold the archive answer until the user has typed, otherwise a slow run fills the label first.
    let answerLookup: () => void = () => undefined;
    const lookupHeld = new Promise<void>((resolve) => (answerLookup = resolve));
    mockFetch({
      "/api/missions/verify-system": async () => {
        await lookupHeld;
        return { found: true, systemLabel: "Almanac Label" };
      },
      "GET /api/planet-status": { systemStatuses: [] },
    });
    const { user, dialog, onSave } = renderForm({ initialValues: { systemAddress: "1234567890AB" } });

    const title = within(dialog).getByRole("textbox", { name: t("missions.mission_name") });
    await user.type(title, "My title");
    await user.type(within(dialog).getByRole("textbox", { name: t("common.objective") }), "Map everything");
    const system = within(dialog).getByRole("textbox", { name: new RegExp(t("system.system_sector_name")) });
    await user.type(system, "Sector 7");
    answerLookup();
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    // Il titolo modificato a mano e l'etichetta scritta dall'utente non vengono sovrascritti dall'archivio.
    expect(title).toHaveValue("My title");
    expect(system).toHaveValue("Sector 7");
    await user.click(create);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "My title",
        description: "Map everything",
        system: "Sector 7",
        systemLabelFromAlmanac: false,
        systemVerified: true,
      }),
    );
  });

  it("refuses to save while the archive check is still running", async () => {
    const { requests } = mockFetch({
      "/api/missions/verify-system": () => new Promise(() => undefined),
      "GET /api/planet-status": { systemStatuses: [] },
    });
    const { dialog, onSave } = renderForm({ initialValues: { systemAddress: "1234567890AB", title: "Pending" } });

    expect(within(dialog).getByRole("button", { name: t("missions.create_mission") })).toBeDisabled();
    fireEvent.submit(dialog.querySelector("form")!);
    expect(await within(dialog).findByText(t("common.wait_for_the_archive_check_to_finish"))).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(requests("GET", "/api/missions/verify-system")).toHaveLength(1), { timeout: 2000 });
  });

  it("replaces or clears a system label that came from the archive", async () => {
    mockFetch({
      "/api/missions/verify-system": ({ url }: { url: URL }) =>
        url.searchParams.get("galaxy") === "0" ? { found: true, systemLabel: "Fresh Label" } : { found: false },
      "GET /api/planet-status": { systemStatuses: [] },
    });
    const { user, dialog } = renderForm({
      initialValues: { systemAddress: "1234567890AB", system: "Stale Label", systemLabelFromAlmanac: true },
    });

    const system = within(dialog).getByRole("textbox", { name: new RegExp(t("system.system_sector_name")) });
    await waitFor(() => expect(system).toHaveValue("Fresh Label"), { timeout: 2000 });
    // Cambiando galassia l'etichetta presa dall'archivio viene azzerata.
    await user.selectOptions(within(dialog).getByRole("combobox", { name: t("stations.galaxy") }), "1");
    expect(system).toHaveValue("");
  });

  it("drops the archive label when the system is no longer found", async () => {
    mockFetch({
      "/api/missions/verify-system": { found: false },
      "GET /api/planet-status": { systemStatuses: [] },
    });
    const { dialog, onSave, user } = renderForm({
      initialValues: { systemAddress: "1234567890AB", system: "Stale Label", systemLabelFromAlmanac: true },
    });

    const system = within(dialog).getByRole("textbox", { name: new RegExp(t("system.system_sector_name")) });
    await waitFor(() => expect(system).toHaveValue(""), { timeout: 2000 });
    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);
    await waitFor(() =>
      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({ system: "", systemLabelFromAlmanac: false, systemVerified: false }),
      ),
    );
  });

  it("reports malformed or failed planet task responses", async () => {
    const cases: Array<[unknown, string]> = [
      [json({}, 500), "Unable to read planet status."],
      [json("oops", 500), "Unable to read planet status."],
      [{ other: true }, "Invalid planet status response."],
      ["not an object", "Invalid planet status response."],
      [{ systemStatuses: ["bogus"] }, "Invalid planet status response."],
      [() => Promise.reject("offline"), "Unable to read planet status."],
    ];
    for (const [route, message] of cases) {
      mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": route });
      const { dialog, unmount } = renderForm({ mission: makeMission() });
      expect(await within(dialog).findByText(message)).toBeInTheDocument();
      expect(within(dialog).queryByRole("checkbox", { name: t("mapped") })).not.toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the saved progress of an edited mission", async () => {
    mockFetch({
      "/api/missions/verify-system": { found: true },
      "GET /api/planet-status": { systemStatuses: ["mapped"] },
    });
    const { dialog } = renderForm({ mission: makeMission({ progress: 30 }) });

    await waitFor(() => expect(within(dialog).getByRole("checkbox", { name: t("mapped") })).toBeChecked());
    expect(within(dialog).getByText("30%")).toBeInTheDocument();
  });

  it("ignores the planet tasks of an address that was changed in the meantime", async () => {
    const rejecters: Array<(reason: unknown) => void> = [];
    const { requests } = mockFetch({
      "/api/missions/verify-system": { found: true },
      "GET /api/planet-status": vi
        .fn()
        .mockImplementationOnce(() => new Promise((_, reject) => rejecters.push(reject)))
        .mockReturnValue({ systemStatuses: ["mapped"] }),
    });
    const { user, dialog } = renderForm({ mission: makeMission() });

    await waitFor(() => expect(rejecters).toHaveLength(1));
    expect(within(dialog).getByText(t("planet.loading_planet_status"))).toBeInTheDocument();
    const address = within(dialog).getByRole("textbox", { name: t("stations.12_glyph_portal_address") });
    await user.click(within(dialog).getByRole("button", { name: t("stations.remove_last_glyph") }));
    await user.type(address, "B");
    await waitFor(() => expect(within(dialog).getByRole("checkbox", { name: t("mapped") })).toBeChecked());
    rejecters[0](new Error("Stale request failed."));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(within(dialog).queryByText("Stale request failed.")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("checkbox", { name: t("mapped") })).toBeChecked();
    expect(requests("GET", "/api/planet-status")).toHaveLength(2);
  });

  it("unchecks a planet task and reports malformed save responses", async () => {
    const { requests } = mockFetch({
      "/api/missions/verify-system": { found: true },
      "GET /api/planet-status": { systemStatuses: ["mapped"] },
      "PATCH /api/planet-status": vi
        .fn()
        .mockReturnValueOnce(json({}, 500))
        .mockReturnValueOnce(json(null, 500))
        .mockReturnValueOnce({ other: true })
        .mockReturnValueOnce(json(null))
        .mockReturnValueOnce({ systemStatuses: ["bogus"] })
        .mockImplementationOnce(() => Promise.reject("offline"))
        .mockReturnValueOnce({ systemStatuses: [] }),
    });
    const { user, dialog } = renderForm({ mission: makeMission() });

    const mapped = await within(dialog).findByRole("checkbox", { name: t("mapped") });
    await waitFor(() => expect(mapped).toBeChecked());
    const expected = [
      "Unable to save planet status.",
      "Unable to save planet status.",
      "Invalid planet status response.",
      "Invalid planet status response.",
      "Invalid planet status response.",
      "Unable to save planet status.",
    ];
    for (const message of expected) {
      await waitFor(() => expect(mapped).toBeEnabled(), { timeout: 2000 });
      await user.click(mapped);
      expect(await within(dialog).findByText(message)).toBeInTheDocument();
      expect(mapped).toBeChecked();
    }
    await waitFor(() => expect(mapped).toBeEnabled());
    await user.click(mapped);
    await waitFor(() => expect(mapped).not.toBeChecked());
    expect(within(dialog).queryByText("Unable to save planet status.")).not.toBeInTheDocument();
    expect(requests("PATCH", "/api/planet-status").at(-1)?.body).toEqual({
      portal: "1234567890AB",
      galaxy: 0,
      systemStatuses: [],
    });
  });

  it("uses generic messages when saving or deleting fails without an error", async () => {
    mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": { systemStatuses: [] } });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { user, dialog, onClose } = renderForm({
      mission: makeMission(),
      onSave: vi.fn(() => Promise.reject("nope")),
      onDelete: vi.fn(() => Promise.reject("nope")),
    });

    const save = within(dialog).getByRole("button", { name: t("common.save_changes") });
    await waitFor(() => expect(save).toBeEnabled(), { timeout: 2000 });
    await user.click(save);
    expect(await within(dialog).findByText(t("errors.save_failed"))).toBeInTheDocument();
    await user.click(within(dialog).getByRole("button", { name: t("common.delete") }));
    expect(await within(dialog).findByText(t("errors.deletion_failed"))).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("lists unknown discoverers and assignees and clears the selections", async () => {
    mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": { systemStatuses: [] } });
    const incomplete = makeMember({ publicId: "m-2", nmsName: "", name: "Real Name", specialty: "", nmsCode: "CODE" });
    const onSave = vi.fn(async () => undefined);
    const { user, dialog, unmount } = renderForm({
      onSave,
      members: [incomplete],
      initialValues: {
        systemAddress: "1234567890AB",
        title: "Assign",
        stationOwnerMemberId: "gone-owner",
        assignedMemberId: "gone-member",
        assignedTo: "Old Pilot",
      },
    });

    const discoverer = within(dialog).getByRole("combobox", { name: t("missions.system_discoverer") });
    expect(within(discoverer).getAllByRole("option", { name: t("common.not_specified") })).toHaveLength(2);
    await user.selectOptions(discoverer, "");
    expect(discoverer).toHaveValue("");

    const assign = within(dialog).getByRole("combobox", { name: t("common.assign_to") });
    expect(within(assign).getByRole("option", { name: "Old Pilot" })).toHaveValue("gone-member");
    expect(
      within(assign).getByRole("option", { name: `Real Name · ${t("profile.specialty_incomplete")} · CODE · PC` }),
    ).toBeInTheDocument();
    await user.selectOptions(assign, "m-2");
    await user.selectOptions(assign, "");
    expect(assign).toHaveValue("");
    await user.selectOptions(assign, "m-2");

    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    await user.click(create);
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ stationOwnerMemberId: undefined, assignedMemberId: "m-2", assignedTo: "Real Name" }),
    );
    unmount();

    const second = renderForm({ initialValues: { assignedMemberId: "gone-member" } });
    expect(
      within(within(second.dialog).getByRole("combobox", { name: t("common.assign_to") })).getByRole("option", {
        name: t("common.existing_assignment"),
      }),
    ).toHaveValue("gone-member");
  });
  it("leaves the title empty when no system name can be generated", async () => {
    generatedName.value = "";
    mockFetch({ "/api/missions/verify-system": { found: true }, "GET /api/planet-status": { systemStatuses: [] } });
    const { dialog } = renderForm({ initialValues: { systemAddress: "1234567890AB" } });

    const create = within(dialog).getByRole("button", { name: t("missions.create_mission") });
    await waitFor(() => expect(create).toBeEnabled(), { timeout: 2000 });
    expect(within(dialog).getByRole("textbox", { name: t("missions.mission_name") })).toHaveValue("");
  });
});
