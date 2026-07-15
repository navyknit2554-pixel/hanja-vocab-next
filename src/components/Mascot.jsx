export function Mascot({ mood = "happy", small = false }) {
  return (
    <div className={`mascot ${mood} ${small ? "smallMascot" : ""}`} aria-hidden="true">
      <div className="mascotBody">
        <span className="eye left" />
        <span className="eye right" />
        <span className="mouth" />
        <span className="spark">!</span>
      </div>
      <span className="mascotName">초록이</span>
    </div>
  );
}
