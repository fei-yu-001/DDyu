import { defineCollection, z } from "astro:content";

// 博客文章：一个 Markdown 文件一篇，文件名即 slug。
// 用传统 content collection（src/content/blog/*.md），条目带 slug 与 render()。
const blog = defineCollection({
  type: "content",
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    date: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    draft: z.boolean().default(false),
    cover: z.string().optional(),
  }),
});

export const collections = { blog };
