const mascotImages = {
  book: "/characters/book.png",
  happy: "/characters/happy.png",
  wink: "/characters/wink.png",
  heart: "/characters/heart.png",
  curious: "/characters/curious.png",
  study: "/characters/study.png",
  discover: "/characters/discover.png",
  search: "/characters/search.png",
  correct: "/characters/correct.png",
  wrong: "/characters/wrong.png",
  levelup: "/characters/levelup.png",
  streak: "/characters/streak.png",
  sleep: "/characters/sleep.png",
  loading: "/characters/loading.png"
};

export function Mascot({ variant = "happy", mood, small = false, level, label = "초록이" }) {
  const image = mascotImages[variant] || mascotImages[mood] || mascotImages.happy;

  return (
    <div className={`mascot mascot-${variant} ${small ? "smallMascot" : ""}`} aria-hidden="true">
      <img className="mascotImage" src={image} alt="" draggable="false" />
      <span className="mascotName">{label}</span>
      {level ? <span className="mascotLevel">Lv. {level}</span> : null}
    </div>
  );
}
