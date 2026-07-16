export default function manifest() {
  return {
    name: "초록이한자학습",
    short_name: "초록이한자",
    description: "초록이와 함께하는 한자 어휘 학습",
    start_url: "/student",
    scope: "/",
    display: "standalone",
    background_color: "#f8fffb",
    theme_color: "#58cc02",
    orientation: "portrait",
    icons: [
      {
        src: "/chologi-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any maskable"
      }
    ]
  };
}
