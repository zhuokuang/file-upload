// 切片大小 10M
const SIZE = 10 * 1024 * 1024;

/**
 * 专门用于分段上传的函数，支持文件分段上传，暂停上传，继续上传
 * @param {String} url 请求路径
 * @param {*} options 请求配置参数
 */
function requestWithChunks(
  url,
  {
    method = "POST",
    file,
    headers = {},
    cancelToken,
    resumeToken,
    chunkSize = SIZE,
  } = {}
) {
  return new Promise(function (resolve) {
    // 支持第一个参数为 url，或者将 url 写在 options 中
    if (typeof url === "object" && url !== "null") {
      const options = url;
      ({ url, method, file, headers } = options);
    }

    // requestList: { formData: FormData, cancel: Cancel } 保存请求的 formData 和 取消请求的函数
    const requestList = splitChunks(file, chunkSize)
      .map((chunk, index) => {
        const formData = new FormData();
        formData.append("chunk", chunk);
        formData.append("hash", index);
        formData.append("name", file.name);
        return formData;
      })
      .map((formData) => ({ formData, cancel: null }));

    // 发送请求
    send(requestList);

    // 暴露取消请求的方法
    if (typeof cancelToken === "function") {
      cancelToken(cancel);
    }

    // 暴露继续上传的方法
    if (typeof resumeToken === "function") {
      resumeToken(resume);
    }

    // 并行发送请求，上传文件切片
    function send(requestList) {
      requestList.map((item) =>
        request(url, {
          method,
          data: item.formData,
          headers,
          cancelToken: (c) => (item.cancel = c),
        }).then((res) => {
          requestList.splice(requestList.indexOf(item), 1);
          // 如果全部切片请求成功，则让 promise 变为成功态
          if (requestList.length === 0) {
            resolve("all chunks upload success");
          }
          return res;
        })
      );
    }

    function cancel() {
      requestList.forEach((item) => item.cancel());
    }

    function resume() {
      send(requestList);
    }

    // 将文件划分为切片
    function splitChunks(file, size) {
      const fileChunks = [];
      for (let i = 0; i < file.size; i += size) {
        fileChunks.push(file.slice(i, i + size));
      }
      return fileChunks;
    }
  });
}

/**
 * 请求函数，使用 promise 封装，xhr 实现
 * @param {String} url 请求路径
 * @param {*} options 请求配置参数，cancelToken 为回调函数，将取消请求的方法暴露出来，用于取消请求。
 */
function request(
  url,
  { method = "POST", data = {}, headers = {}, cancelToken } = {}
) {
  // 支持第一个参数为 url，或者将 url 写在 options 中
  if (typeof url === "object" && url !== "null") {
    const options = url;
    ({ url, method, data, headers } = options);
  }

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.keys(headers).forEach((key) => {
      const value = headers[key];
      xhr.setRequestHeader(key, value);
    });
    xhr.send(data);

    // 是否需要取消请求
    if (typeof cancelToken === "function") {
      cancelToken(() => xhr.abort());
    }

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
