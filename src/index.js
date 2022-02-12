// 划分之后的切片文件，数组
let requestXhrsAndChunks = [];
// 上传的文件名
let filename = "filename";
// 切片大小 10M
const SIZE = 1 * 1024 * 1024;

/**
 * 请求函数，使用 promise 封装，xhr 实现
 * @param {*} url 请求路径
 * @param {*} options 请求配置参数
 * @param {*} callbacks afterRequest 为发送请求之后的同步回调函数，参数为发送请求的 xhr；onSuccess 为请求成功之后的异步回调函数，参数为发送请求的 xhr
 */
function request(url, { method = "POST", data, headers = {} }, callbacks) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.keys(headers).forEach((key) => {
      const value = headers[key];
      xhr.setRequestHeader(key, value);
    });
    xhr.send(data);

    // 发送请求之后，暴露 xhr 给外部，让外部可以取消请求，实现暂停上传
    callbacks?.afterRequest?.(xhr);

    // 请求成功的回调
    xhr.onload = function (e) {
      // console.log('success', e.target)
      resolve(e.target);
      // 请求成功之后执行外部的回调函数
      callbacks?.onSuccess?.(xhr);
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
async function upload() {
  const requests = requestXhrsAndChunks
    .map(({ chunk, hash }) => {
      const formData = new FormData();
      formData.append("chunk", chunk);
      formData.append("hash", hash);
      formData.append("name", filename);
      return formData;
    })
    // 先上传切片，上传完再合并
    .map((data, index) =>
      request(
        "http://localhost:3000/upload",
        { data },
        {
          // 发送请求后，将 xhr 暴露出来，方便后续取消请求
          afterRequest: (xhr) => (requestXhrsAndChunks[index].xhr = xhr),
          // 请求成功之后，删除对应切片及其请求
          onSuccess: (xhr) =>
            requestXhrsAndChunks.splice(
              requestXhrsAndChunks.findIndex((item) => item.xhr === xhr),
              1
            ),
        }
      )
    );

  console.log("before", [...requestXhrsAndChunks]);
  const uploadRequestRes = await Promise.all(requests);
  console.log("uploadRequestRes:", uploadRequestRes);
  console.log("after", [...requestXhrsAndChunks]);

  const data = {
    filename,
    size: SIZE,
  };
  // 所有文件切片上传成功之后，发送合并切片请求
  await request("http://localhost:3000/merge", {
    headers: {
      "content-type": "application/json",
    },
    data: JSON.stringify(data),
  });

  // 上传成功之后，清空 input 框
  resetInput();
}

// 清空 input 框
function resetInput() {
  const input = document.getElementById("upload-input");
  input.value = "";
}

// 选择文件函数
function changeUploadFile(file) {
  requestXhrsAndChunks = splitChunks(file).map((chunk, index) => ({
    hash: index,
    xhr: null,
    chunk,
  }));
  filename = file.name;
}

function pause() {
  requestXhrsAndChunks.forEach((item) => item.xhr.abort());
  // TODO: 持久化保存状态，防止浏览器刷新状态丢失
}
