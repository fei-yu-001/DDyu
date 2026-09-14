// @ts-check
import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";

// 博客挂在同域名的根路径。站点地址只在构建期注入（canonical / sitemap / RSS 用），
// 本地开发留空即可：不生成 canonical、sitemap 与 OG url。
const site = process.env.BLOG_SITE?.trim().replace(/\/+$/, "") || undefined;

export default defineConfig({
  site,
  // 产物直接输出到 Go 后端挂载的目录（frontend.blogStaticPath）。
  outDir: "../static/blog",
  vite: {
    plugins: [tailwindcss()],
  },
  integrations: site ? [sitemap()] : [],
  markdown: {
    shikiConfig: {
      themes: { light: "github-light", dark: "github-dark" },
    },
  },
});
