const http = require("http");
const { upload, merge } = require("./controller");

const server = http.createServer();

server.on("request", async (req, res) => {
  // 处理跨域
  res.setHeader("Access-Control-Allow-Origin", "*");
  // merge 请求需要自定义请求头："content-type": "application/json"，所以得设置 Access-Control-Allow-Headers
  res.setHeader("Access-Control-Allow-Headers", "*");

  // 处理预检请求
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "86400");
    res.status = 200;
    res.end();
    return;
  }

  // upload 请求处理
  if (req.url === "/upload") {
    upload(req, res);
  }

  // merge 请求处理
  if (req.url === "/merge") {
    merge(req, res);
  }
});

server.listen(3000, () => console.log("正在监听 3000 端口"));
