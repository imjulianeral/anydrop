import type { DeviceGroup, Peer } from "#/lib/api.ts";

/** Which circles the share page shows: groups, your devices, or everyone else's. */
export type CircleFilter = "groups" | "mine" | "others";

export const circleFilters: readonly CircleFilter[] = [
  "groups",
  "mine",
  "others",
];

/** Where an unset filter lands when no selection decides it. */
const fallbackOrder: readonly CircleFilter[] = ["mine", "others", "groups"];

/**
 * A device belongs to "others" unless it's saved to this account, so realtime
 * newcomers, whose relation isn't known yet, stay reachable.
 */
const peerFilter = (peer: Pick<Peer, "relation">): CircleFilter =>
  peer.relation === "mine" ? "mine" : "others";

export const peersFor = (filter: CircleFilter, peers: Peer[]) =>
  filter === "groups"
    ? []
    : peers.filter((peer) => peerFilter(peer) === filter);

export const groupsFor = (filter: CircleFilter, groups: DeviceGroup[]) =>
  filter === "groups" ? groups : [];

/**
 * The filter to show before the viewer picks one: the tab holding what's
 * selected, otherwise the first tab with something in it.
 */
export const defaultCircleFilter = ({
  peers,
  groups,
  selectedPeer,
  selectedGroup,
}: {
  peers: Peer[];
  groups: DeviceGroup[];
  selectedPeer: Pick<Peer, "id" | "relation"> | null;
  selectedGroup: DeviceGroup | null;
}): CircleFilter => {
  if (selectedGroup) {
    return "groups";
  }
  if (selectedPeer) {
    return peerFilter(selectedPeer);
  }
  return (
    fallbackOrder.find(
      (filter) =>
        peersFor(filter, peers).length + groupsFor(filter, groups).length > 0
    ) ?? "others"
  );
};

export const parseCircleFilter = (value: string) =>
  circleFilters.find((filter) => filter === value);
