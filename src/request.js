/**
 *
 * @param {Boolean} needCancel 是否支持取消请求，如果支持取消请求，则暴露取消请求的方法
 */
function wrapRequest(needCancel = false) {
  // 存储 xhr 和 请求的数据
  const xhrsAndDatasList = needCancel ? [] : null;

  /**
   * 请求函数，使用 promise 封装，xhr 实现
   * @param {String} url 请求路径
   * @param {*} options 请求配置参数
   */
  function request(url, { method = "POST", data = {}, headers = {} } = {}) {
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

      if (needCancel) {
        // 请求的数据也要抛出，因为旧的 xhr 一旦取消，就不能继续发送了。只能重新创建新的 xhr 发送请求
        xhrsAndDatasList.push({ xhr, options: { url, method, data, headers } });
      }

      // 请求成功的回调
      xhr.onload = function (e) {
        // console.log('success', e.target)
        resolve(e.target);

        if (needCancel) {
          xhrsAndDatasList.splice(
            xhrsAndDatasList.findIndex((item) => item.xhr === xhr),
            1
          );

          // 所有文件切片上传完成，抛出合并文件信号
          if (xhrsAndDatasList.length === 0) {
          }
        }
      };

      // 请求失败的回调
      xhr.onerror = function (e) {
        // console.log('error', e.target);
        reject(e.target);
      };
    });
  }

  function cancel() {
    xhrsAndDatasList.forEach((item) => item.xhr.abort());
  }

  async function resume() {
    const tempList = [...xhrsAndDatasList];
    xhrsAndDatasList.length = 0;
    await tempList.map((item) => request(item.options));
  }

  if (needCancel) {
    return { request, cancel, resume };
  } else {
    return { request };
  }
}
