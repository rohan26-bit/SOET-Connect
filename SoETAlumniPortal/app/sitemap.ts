import type { MetadataRoute } from "next";

const siteUrl = "https://soet-connect.vercel.app";

export default function sitemap(): MetadataRoute.Sitemap {
  // DashboardLayout-protected routes must not be advertised as public pages.
  return [
    {
      url: siteUrl,
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
