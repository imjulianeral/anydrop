import { describe, expect, test } from "vitest";

import type { DeviceGroup, Peer } from "#/lib/api.ts";
import {
  defaultCircleFilter,
  groupsFor,
  parseCircleFilter,
  peersFor,
} from "#/lib/circle-filter.ts";

const peer = (id: string, overrides: Partial<Peer> = {}): Peer => ({
  id,
  public_key: null,
  display_name: id,
  device_kind: "desktop",
  room_code: null,
  last_seen_at: "2026-09-27T00:00:00Z",
  ...overrides,
});

const group = (id: string): DeviceGroup => ({
  id,
  name: id,
  owner_id: null,
  kind: "device",
  members: [],
});

const mine = peer("laptop", { relation: "mine", saved: true });
const teammate = peer("teammate", { relation: "team", saved: true });
const nearby = peer("nearby", { relation: "nearby" });
const newcomer = peer("newcomer");

describe("circle filters", () => {
  test("split devices into yours and everyone else's", () => {
    const peers = [mine, teammate, nearby, newcomer];
    expect(peersFor("mine", peers)).toStrictEqual([mine]);
    expect(peersFor("others", peers)).toStrictEqual([
      teammate,
      nearby,
      newcomer,
    ]);
    expect(peersFor("groups", peers)).toStrictEqual([]);
  });

  test("show groups only under groups", () => {
    const groups = [group("family")];
    expect(groupsFor("groups", groups)).toStrictEqual(groups);
    expect(groupsFor("mine", groups)).toStrictEqual([]);
    expect(groupsFor("others", groups)).toStrictEqual([]);
  });

  test("start on the tab holding the selection", () => {
    const base = { peers: [mine, nearby], groups: [group("family")] };
    expect(
      defaultCircleFilter({
        ...base,
        selectedPeer: null,
        selectedGroup: group("family"),
      })
    ).toBe("groups");
    expect(
      defaultCircleFilter({
        ...base,
        selectedPeer: nearby,
        selectedGroup: null,
      })
    ).toBe("others");
  });

  test("otherwise start on the first tab with something in it", () => {
    const none = { selectedPeer: null, selectedGroup: null };
    expect(
      defaultCircleFilter({ ...none, peers: [nearby, mine], groups: [] })
    ).toBe("mine");
    expect(
      defaultCircleFilter({ ...none, peers: [nearby], groups: [group("a")] })
    ).toBe("others");
    expect(
      defaultCircleFilter({ ...none, peers: [], groups: [group("a")] })
    ).toBe("groups");
    expect(defaultCircleFilter({ ...none, peers: [], groups: [] })).toBe(
      "others"
    );
  });

  test("parse only known filters", () => {
    expect(parseCircleFilter("mine")).toBe("mine");
    expect(parseCircleFilter("friends")).toBeUndefined();
  });
});
