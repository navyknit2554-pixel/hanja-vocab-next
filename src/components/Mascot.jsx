const mascotImages = {
  hero: "/characters/hero.jpg",
  book: "/characters/book.jpg",
  happy: "/characters/happy.jpg",
  wink: "/characters/wink.jpg",
  heart: "/characters/heart.jpg",
  curious: "/characters/curious.png",
  study: "/characters/study.jpg",
  discover: "/characters/discover.jpg",
  search: "/characters/discover.jpg",
  correct: "/characters/correct.jpg",
  wrong: "/characters/wrong.png",
  levelup: "/characters/heart.jpg",
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
