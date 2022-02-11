const path = require("path");
const fse = require("fs-extra");
const Multiparty = require("multiparty");

// 存放临时切片的目录
const TEMPDIR = path.resolve(__dirname, "..", "temp");
// 存放上传文件的目录
const TARGETDIR = path.resolve(__dirname, "..", "target");

const getPostData = (req) => {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      resolve(JSON.parse(data));
    });
  });
};

const pipeStream = (path, writeStream) =>
  new Promise((resolve) => {
    const readStream = fse.createReadStream(path);

    // 采坑记录：这里一直没走到 end 事件，也没有报错信息。
    // 原来是目标文件夹不存在，所以不能直接写入
    readStream.on("end", () => {
      fse.unlinkSync(path);
      resolve();
    });
    readStream.pipe(writeStream);
  });

const upload = (req, res) => {
  // 处理分片逻辑
  const multiparty = new Multiparty.Form();
  multiparty.parse(req, async (err, fields, files) => {
    // 错误处理
    if (err) {
      console.error(err);
      res.status = 500;
      res.end("upload file chunk failed");
      return;
    }
    // 文件分片
    const [chunk] = files.chunk;
    // 切片哈希，这里为了方便设置为索引
    const [hash] = fields.hash;
    // 文件名
    const [filename] = fields.name;
    // 扩展名
    const ext = filename.split(".").pop();

    console.log("hash:", hash);
    console.log("size:", chunk.size);

    // 目录不存在在创建目录
    if (!fse.existsSync(TEMPDIR)) {
      await fse.mkdirs(TEMPDIR);
    }

    // 每个切片的路径
    const chunkpath = path.resolve(
      TEMPDIR,
      `${filename.slice(0, filename.lastIndexOf("."))}-${hash}.${ext}`
    );

    // 如果文件存在则不进行创建，直接返回
    if (fse.existsSync(chunkpath)) {
      res.end("file chunk exist");
      return;
    }

    await fse.move(chunk.path, chunkpath);
    res.end("chunk received");
  });
};

const merge = async (req, res) => {
  const data = await getPostData(req);
  const { filename, size } = data;

  const chunkNames = await fse.readdir(TEMPDIR);
  chunkNames.sort((a, b) => {
    const hashA = a.slice(a.lastIndexOf("-") + 1, a.lastIndexOf("."));
    const hashB = b.slice(b.lastIndexOf("-") + 1, b.lastIndexOf("."));
    return hashA - hashB;
  });
  console.log("chunkNames:", chunkNames);

  if (!fse.existsSync(TARGETDIR)) {
    await fse.mkdirs(TARGETDIR);
  }

  await Promise.all(
    chunkNames.map((chunkName, index) =>
      pipeStream(
        path.resolve(TEMPDIR, chunkName),
        // 这里的文件夹必须要存在，否则走不到 readStream 的 end 事件，也不会报错
        fse.createWriteStream(path.resolve(TARGETDIR, filename), {
          start: size * index,
        })
      )
    )
  );

  console.log("finish merge");

  // 合并文件后移除临时文件夹
  fse.rmdirSync(TEMPDIR);

  // 请求成功，响应数据
  res.end(
    JSON.stringify({
      code: 0,
      message: "file merged success",
    })
  );
};

module.exports = {
  upload,
  merge,
};
