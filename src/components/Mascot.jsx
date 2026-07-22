export function Mascot({ mood = "happy", small = false, growth = null }) {
  const stage = growth?.stage || { name: "초록이", color: "#58cc02", accent: "#6c37ff" };
  return (
    <div
      className={`mascot ${mood} ${small ? "smallMascot" : ""}`}
      style={{ "--mascot-color": stage.color, "--mascot-accent": stage.accent }}
      aria-hidden="true"
    >
      <div className="mascotBody">
        <span className="eye left" />
        <span className="eye right" />
        <span className="mouth" />
        <span className="spark">!</span>
      </div>
      <span className="mascotName">{stage.name}</span>
      {growth?.level && <span className="mascotLevel">Lv.{growth.level}</span>}
    </div>
  );
}
