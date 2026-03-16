"use client";

export default function Db2StatusButton() {
  return (
    <div
      title="IBM Db2 connection removed — app runs on SQLite fallback"
      style={{
        display: "flex", alignItems: "center", gap: 6,
        fontSize: 9, fontWeight: 600,
        background: "rgba(239,68,68,0.07)",
        border: "1px solid rgba(239,68,68,0.22)",
        borderRadius: 6, padding: "4px 10px",
      }}
    >
      {/* Red dot */}
      <div style={{
        width: 6, height: 6, borderRadius: "50%",
        background: "#EF4444",
        boxShadow: "0 0 5px #EF4444",
        flexShrink: 0,
      }} />
      <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ color: "#F87171", letterSpacing: "0.05em" }}>IBM Db2</span>
        <span style={{ fontSize: 7, color: "#7F1D1D", letterSpacing: "0.03em" }}>
          connection removed
        </span>
      </div>
    </div>
  );
}
