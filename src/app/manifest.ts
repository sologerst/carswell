import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  const name = process.env.NEXT_PUBLIC_APP_NAME ?? "CarSwipe";
  return {
    id: "/",
    name: `${name}: your AI car buyer`,
    short_name: name,
    description: "Swipe nearby cars. Dealers compete with real out-the-door prices.",
    start_url: "/deck",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#060b1a",
    theme_color: "#060b1a",
    categories: ["shopping", "lifestyle", "auto"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Deck", url: "/deck" },
      { name: "Offers", url: "/offers" },
      { name: "Likes", url: "/likes" },
    ],
  };
}
