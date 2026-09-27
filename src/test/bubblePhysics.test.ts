import { describe, expect, it } from "vitest";
import { bubbleRadius, seedNodes, stepNodes } from "@/services/bubblePhysics";

describe("bubble physics", () => {
  it("makes larger values larger circles", () => {
    expect(bubbleRadius(100, 100, 10, 40)).toBeGreaterThan(bubbleRadius(25, 100, 10, 40));
  });

  it("keeps circles from sitting on top of each other after a settle", () => {
    const nodes = seedNodes(
      [
        { id: "a", value: 100 },
        { id: "b", value: 40 },
        { id: "c", value: 10 },
      ],
      400,
      400
    );
    for (let i = 0; i < 80; i++) stepNodes(nodes, 400, 400, null);
    const a = nodes.find((n) => n.id === "a")!;
    const b = nodes.find((n) => n.id === "b")!;
    expect(Math.hypot(a.x - b.x, a.y - b.y) + 0.5).toBeGreaterThanOrEqual(a.r + b.r);
  });
});
