// 壁纸明显度：博客与创意工坊共用同一个 localStorage 值，
// 通过 CSS 变量 --bg-veil（1 - 明显度/100）控制半透明罩浓度。
const bgProminenceStorageKey = "ddyu:bg-prominence";
const defaultBgProminence = 70;

export function readBgProminence(): number {
  if (typeof window === "undefined") return defaultBgProminence;
  try {
    const stored = window.localStorage.getItem(bgProminenceStorageKey);
    if (stored === null) return defaultBgProminence;
    const value = Number(stored);
    return Number.isFinite(value) && value >= 0 && value <= 100 ? value : defaultBgProminence;
  } catch {
    // 隐私模式下 localStorage 不可用，退回默认值。
    return defaultBgProminence;
  }
}

export function storeBgProminence(prominence: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(bgProminenceStorageKey, String(Math.round(prominence)));
  } catch {
    // 同上，忽略：设置仅对本次会话有效。
  }
}

export function applyBgProminence(prominence: number): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty("--bg-veil", String(1 - prominence / 100));
}
