export async function GET(context) {
  const lines = ["User-agent: *", "Allow: /"];
  if (context.site) {
    lines.push(`Sitemap: ${new URL("sitemap-index.xml", context.site).href}`);
  }
  return new Response(lines.join("\n") + "\n", {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
