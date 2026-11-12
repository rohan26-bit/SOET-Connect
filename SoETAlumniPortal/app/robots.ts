import type { MetadataRoute } from "next";

const siteUrl = "https://soet-connect.vercel.app";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/admin/",
          "/student/",
          "/alumni/",
          "/dashboard/",
          "/messages/",
          "/notifications/",
          "/settings/",
        ],
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
