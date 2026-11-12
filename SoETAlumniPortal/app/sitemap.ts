import type { MetadataRoute } from "next";

const siteUrl = "https://soet-connect.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  const publicRoutes = ["", "/gallery", "/gallery/placements"];

  return publicRoutes.map((route) => ({
    url: `${siteUrl}${route}`,
    changeFrequency: route === "" ? "weekly" : "monthly",
    priority: route === "" ? 1 : 0.7,
  }));
}
