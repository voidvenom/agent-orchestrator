// Enabled only for the custom Linux AppImage build (Vite replaces this at build time).
export const manualLinuxUpdates = import.meta.env.VITE_AO_MANUAL_LINUX_UPDATES === "1";
export const manualLinuxUpdateRepo = { owner: "voidvenom", repo: "agent-orchestrator" } as const;
