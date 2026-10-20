import { fmtDuration, quotaState } from "./quota";

describe("quota helpers", () => {
  it("says how long until the reset in hours and minutes", () => {
    expect(fmtDuration(6 * 3_600_000 + 12 * 60_000)).toBe("6h 12m");
    expect(fmtDuration(2 * 3_600_000)).toBe("2h");
    expect(fmtDuration(41 * 60_000)).toBe("41m");
    expect(fmtDuration(20_000)).toBe("less than a minute");
    expect(fmtDuration(0)).toBe("now");
  });

  it("works out what's left and when the limit is close or reached", () => {
    expect(quotaState(42, 100)).toMatchObject({ left: 58, pct: 42, nearLimit: false, exhausted: false });
    expect(quotaState(85, 100)).toMatchObject({ left: 15, nearLimit: true, exhausted: false });
    expect(quotaState(100, 100)).toMatchObject({ left: 0, pct: 100, exhausted: true });
    expect(quotaState(120, 100)).toMatchObject({ left: 0, pct: 100, exhausted: true });
  });
});
