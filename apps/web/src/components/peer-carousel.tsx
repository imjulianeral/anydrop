import { useEffect, useRef, useState } from "react";

import { GroupTile } from "#/components/group-tile.tsx";
import { CylinderCarousel } from "#/components/motion/cylinder-carousel.tsx";
import type { CylinderCarouselHandle } from "#/components/motion/cylinder-carousel.tsx";
import { PeerTile } from "#/components/peer-tile.tsx";
import type { DeviceGroup, Peer } from "#/lib/api.ts";

export function PeerCarousel({
  peers,
  groups,
  selectedId,
  selectedGroupId,
  disabled,
  onSelect,
  onSend,
  onShowItems,
  onSendGroup,
  onShowGroupItems,
  onManageGroup,
}: {
  peers: Peer[];
  groups: DeviceGroup[];
  selectedId: string | null;
  selectedGroupId: string | null;
  disabled: boolean;
  onSelect: (peer: Peer) => void;
  onSend: () => void;
  onShowItems: () => void;
  onSendGroup: (group: DeviceGroup) => void;
  onShowGroupItems: (group: DeviceGroup) => void;
  onManageGroup: (group: DeviceGroup) => void;
}) {
  const [openItemKey, setOpenItemKey] = useState<string | null>(null);
  const carouselRef = useRef<CylinderCarouselHandle>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [visibleItems, setVisibleItems] = useState(1);
  const selectedPeerIndex = peers.findIndex((peer) => peer.id === selectedId);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      setVisibleItems(entry.contentRect.width >= 640 ? 3 : 1);
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (selectedPeerIndex >= 0) {
      carouselRef.current?.scrollTo(groups.length + selectedPeerIndex);
    }
  }, [groups.length, selectedPeerIndex]);

  return (
    <section
      ref={containerRef}
      aria-label="Available devices and groups"
      className="flex w-full max-w-5xl flex-col items-center gap-2"
    >
      <CylinderCarousel
        ref={carouselRef}
        ariaLabel="Available devices and groups"
        variant="concave"
        itemSize={176}
        visibleItems={Math.min(peers.length + groups.length, visibleItems)}
        minScale={0.65}
        height={280}
        defaultIndex={
          selectedPeerIndex >= 0 ? groups.length + selectedPeerIndex : 0
        }
      >
        {groups.map((group, index) => (
          <GroupTile
            key={group.id}
            group={group}
            selected={selectedGroupId === group.id}
            disabled={disabled}
            open={openItemKey === `group:${group.id}`}
            onOpenChange={(next) =>
              setOpenItemKey(next ? `group:${group.id}` : null)
            }
            onSend={onSendGroup}
            onShowItems={onShowGroupItems}
            onManage={onManageGroup}
            onCenter={() => carouselRef.current?.scrollTo(index)}
          />
        ))}
        {peers.map((peer, index) => (
          <PeerTile
            key={peer.id}
            peer={peer}
            selected={selectedId === peer.id}
            disabled={disabled}
            onSelect={onSelect}
            onSend={onSend}
            onShowItems={onShowItems}
            open={openItemKey === `peer:${peer.id}`}
            onOpenChange={(next) =>
              setOpenItemKey(next ? `peer:${peer.id}` : null)
            }
            onCenter={() =>
              carouselRef.current?.scrollTo(groups.length + index)
            }
          />
        ))}
      </CylinderCarousel>
    </section>
  );
}
