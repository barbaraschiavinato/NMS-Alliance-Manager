import { beforeEach, describe, expect, it, vi } from "vitest";
import { signInAs } from "../helpers/auth";
import { makeMember, seedMembers } from "../helpers/members";
import { castMembers, makeCast, resetData, type Cast } from "./helpers/fixtures";

vi.mock("@/auth", async () => (await import("../helpers/auth")).authMock);

let cast: Cast;

beforeEach(() => {
  resetData();
  cast = makeCast();
  seedMembers(castMembers(cast));
});

async function getMembers(query = "") {
  const { GET } = await import("@/app/api/members/route");
  return GET(new Request(`http://localhost:3000/api/members${query}`));
}

describe("GET /api/members", () => {
  it("returns 401 without a session or for pending, blocked and offline members", async () => {
    signInAs(null);
    expect((await getMembers("?id=x")).status).toBe(401);
    for (const member of [cast.pending, cast.blocked, cast.offline]) {
      signInAs(member);
      expect((await getMembers(`?ids=${cast.user.publicId}`)).status).toBe(401);
    }
  });

  it("registers an unknown Google account as pending and rejects it", async () => {
    signInAs({ email: "Newcomer@Example.com", name: "Newcomer", image: "" });
    expect((await getMembers()).status).toBe(401);
    const { readAccessData } = await import("@/lib/access-store");
    expect(
      (await readAccessData()).members.find((member) => member.email === "newcomer@example.com")?.membershipStatus,
    ).toBe("pending");
  });

  describe("?ids=", () => {
    it("returns only the avatar of approved members to any member", async () => {
      const withImage = makeMember({ image: "https://img.example/a.png" });
      seedMembers([...castMembers(cast), withImage]);
      signInAs(cast.user);
      const response = await getMembers(
        `?ids=${withImage.publicId}, ${cast.pending.publicId},,${cast.blocked.publicId},unknown`,
      );
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([{ publicId: withImage.publicId, image: "https://img.example/a.png" }]);
    });
  });

  describe("?id=", () => {
    it("returns 404 for unknown or non-approved members", async () => {
      signInAs(cast.user);
      for (const id of ["unknown", cast.pending.publicId, cast.blocked.publicId]) {
        const response = await getMembers(`?id=${id}`);
        expect(response.status).toBe(404);
      }
    });

    it("shows friend codes but hides contacts, role and email from other users and simple-view admins", async () => {
      const target = makeMember({
        telegramName: "tg",
        discordName: "dc",
        platforms: ["PC", "Mac"],
        specialty: "ranger",
      });
      seedMembers([...castMembers(cast), target]);
      for (const viewer of [cast.user, cast.simpleAdmin]) {
        signInAs(viewer);
        const response = await getMembers(`?id=${target.publicId}`);
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
          publicId: target.publicId,
          name: target.name,
          image: "",
          nmsName: target.nmsName,
          nmsCode: target.nmsCode,
          platforms: ["PC", "Mac"],
          specialty: "ranger",
          offline: false,
        });
      }
    });

    it("shows a member their own contacts and friend code", async () => {
      const self = makeMember({ telegramName: "my-tg" });
      seedMembers([...castMembers(cast), self]);
      signInAs(self);
      const body = (await (await getMembers(`?id=${self.publicId}`)).json()) as Record<string, unknown>;
      expect(body).toMatchObject({ telegramName: "my-tg", discordName: "" });
      expect(body).toHaveProperty("nmsCode", self.nmsCode);
      expect(body).not.toHaveProperty("role");
    });

    it("shows contacts, friend code and role to moderators, never the email", async () => {
      signInAs(cast.moderator);
      const body = (await (await getMembers(`?id=${cast.offline.publicId}`)).json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        offline: true,
        telegramName: "",
        discordName: "",
        nmsCode: cast.offline.nmsCode,
        role: "user",
      });
      expect(body).not.toHaveProperty("email");
    });

    it("blanks names that are email addresses", async () => {
      const target = makeMember({ name: "someone@example.com", nmsName: "someone@example.com" });
      seedMembers([...castMembers(cast), target]);
      signInAs(cast.admin);
      expect(await (await getMembers(`?id=${target.publicId}`)).json()).toMatchObject({ name: "", nmsName: "" });
    });
  });

  describe("full list", () => {
    it("returns 403 for users and simple-view admins", async () => {
      for (const member of [cast.user, cast.simpleAdmin]) {
        signInAs(member);
        expect((await getMembers()).status).toBe(403);
      }
    });

    it("lists approved members with a complete profile to moderators and admins", async () => {
      const noName = makeMember({ nmsName: "" });
      const badCode = makeMember({ nmsCode: "123" });
      const noSpecialty = makeMember({ specialty: "" });
      const offlineWithoutCode = makeMember({ offline: true, nmsCode: "", discordName: "dc" });
      seedMembers([...castMembers(cast), noName, badCode, noSpecialty, offlineWithoutCode]);
      for (const viewer of [cast.moderator, cast.admin]) {
        signInAs(viewer);
        const response = await getMembers();
        expect(response.status).toBe(200);
        const body = (await response.json()) as { publicId: string }[];
        const ids = body.map((entry) => entry.publicId);
        expect(ids).toEqual(
          expect.arrayContaining([
            cast.user.publicId,
            cast.moderator.publicId,
            cast.offline.publicId,
            offlineWithoutCode.publicId,
          ]),
        );
        for (const excluded of [cast.pending, cast.blocked, noName, badCode, noSpecialty])
          expect(ids).not.toContain(excluded.publicId);
        expect(body.find((entry) => entry.publicId === offlineWithoutCode.publicId)).toMatchObject({
          nmsName: offlineWithoutCode.nmsName,
          nmsCode: "",
          telegramName: "",
          discordName: "dc",
          platforms: ["PC"],
          specialty: "explorer",
          role: "user",
        });
      }
    });
  });
});
