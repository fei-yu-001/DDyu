import rss from "@astrojs/rss";
import { getCollection } from "astro:content";

export async function GET(context) {
  const posts = (await getCollection("blog", ({ data }) => !data.draft)).sort(
    (a, b) => b.data.date.valueOf() - a.data.date.valueOf(),
  );
  // 本地构建无 site 时用请求地址兜底，保证 RSS 链接可解析。
  const site = context.site ?? new URL("/", context.request.url);
  return rss({
    title: "DDyu",
    description: "DDyu 个人博客",
    site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: post.data.date,
      description: post.data.description,
      categories: post.data.tags,
      link: `/post/${post.slug}/`,
    })),
  });
}
