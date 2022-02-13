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
  const { filename } = data;

  // 每个文件切片的名字
  const chunkNames = await fse.readdir(TEMPDIR);
  // 需要为切片排序，因为是并发请求，可能前面的切片还没上传完，后面的切片就已经上传完了
  chunkNames.sort((a, b) => {
    const hashA = a.slice(a.lastIndexOf("-") + 1, a.lastIndexOf("."));
    const hashB = b.slice(b.lastIndexOf("-") + 1, b.lastIndexOf("."));
    return hashA - hashB;
  });
  console.log("chunkNames:", chunkNames);

  // 每个文件切片的路径
  const chunkPaths = chunkNames.map((name) => path.resolve(TEMPDIR, name));

  // 如果不存在目标文件夹，则创建
  if (!fse.existsSync(TARGETDIR)) {
    await fse.mkdirs(TARGETDIR);
  }

  const writeStream = fse.createWriteStream(path.resolve(TARGETDIR, filename));

  mergeStream(chunkPaths, writeStream, () => {
    // 合并文件后移除临时文件夹
    fse.rmdirSync(TEMPDIR);
  });

  console.log("finish merge");

  // 请求成功，响应数据
  res.end(
    JSON.stringify({
      code: 0,
      message: "file merged success",
    })
  );
};

function mergeStream(chunks, writeStream, onSuccess) {
  if (!chunks.length) {
    writeStream.end();
    onSuccess?.();
    return;
  }
  var currentChunkPath = chunks.shift();
  readStream = fse.createReadStream(currentChunkPath);

  // 默认配置值为true,此时读取器终止时默认终止写入器（可写流），故需要为false
  readStream.pipe(writeStream, { end: false });

  // 在当前可读流完毕时，执行递归
  readStream.on("end", () => {
    fse.unlinkSync(currentChunkPath);
    mergeStream(chunks, writeStream, onSuccess);
  });
}

module.exports = {
  upload,
  merge,
};
