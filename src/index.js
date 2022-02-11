// 划分之后的切片文件，数组
let globalChunks = null;
// 上传的文件名
let filename = "filename";
// 切片大小 10M
const SIZE = 10 * 1024 * 1024;

// 请求函数，使用 promise 封装
function request(url, { method = "POST", data, headers = {} }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.keys(headers).forEach((key) => {
      const value = headers[key];
      xhr.setRequestHeader(key, value);
    });
    xhr.send(data);

    // 请求成功的回调
    xhr.onload = function (e) {
      // console.log('success', e.target)
      resolve(e.target);
    };

    // 请求失败的回调
    xhr.onerror = function (e) {
      // console.log('error', e.target);
      reject(e.target);
    };
  });
}

// 将文件划分为切片
function splitChunks(file, size = SIZE) {
  const fileChunks = [];
  for (let i = 0; i < file.size; i += size) {
    fileChunks.push(file.slice(i, i + size));
  }
  return fileChunks;
}

// 上传函数
function upload() {
  const requests = globalChunks
    .map((chunk, index) => {
      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("hash", index);
      formData.append("name", filename);
      return formData;
    })
    // 先上传切片，上传完再合并
    .map((data) => request("http://localhost:3000/upload", { data }));
  const fileRequest = Promise.all(requests);
  fileRequest
    .then((res) => {
      console.log("res:", res);
      // 所有切片上传完，发送合并请求
      const data = {
        filename,
        size: SIZE,
      };
      request("http://localhost:3000/merge", {
        headers: {
          "content-type": "application/json",
        },
        data: JSON.stringify(data),
      });
    })
    .catch((err) => {
      console.log("err:", err);
    });
}

// 选择文件函数
function changeUploadFile(file) {
  globalChunks = splitChunks(file);
  filename = file.name;
}
