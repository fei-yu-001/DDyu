// 临时本地 CONNECT 代理：github.com 的 DNS IP 被断，转发到 api.github.com 的可达 IP。
const net = require("net");

const srv = net.createServer((client) => {
  let buf = Buffer.alloc(0);
  client.on("data", (chunk) => {
    buf = Buffer.concat([buf, chunk]);
    const text = buf.toString("utf8");
    const end = text.indexOf("\r\n\r\n");
    if (end < 0) return;
    const m = text.replace(/\r/g, "").match(/^CONNECT ([^ :]+):(\d+) HTTP\/[\d.]+\s/m);
    if (!m) {
      client.end();
      return;
    }
    const host = m[1];
    const port = parseInt(m[2], 10);
    const target = host === "github.com" ? "20.205.243.168" : host;
    const rest = buf.slice(end + 4);
    const sock = net.connect(port, target, () => {
      client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
      if (rest.length) sock.write(rest);
      sock.pipe(client);
      client.pipe(sock);
    });
    sock.on("error", () => {
      try {
        client.end();
      } catch {}
    });
    client.on("error", () => {
      try {
        sock.destroy();
      } catch {}
    });
  });
});

srv.listen(8899, "127.0.0.1", () => console.log("connect proxy on 127.0.0.1:8899"));
