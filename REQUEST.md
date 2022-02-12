## request 优化记录

### 请求时直接暴露 `xhr`

- 缺点：

  1. `request` 函数直接改变外部数组，函数不纯。
  2. `request` 函数无法复用，每发送一次请求，都会将请求的 `xhr` 暴露出来。

`request` 请求：

```javascript
// TODO: request 函数
```

### 使用回调函数暴露 `xhr`

- 优点：

  1. `request` 函数可复用。
  2. 不会直接改变外部数组，相对来说函数更纯。

- 缺点：

  1.  为了实现**取消请求**的功能，暴露出了整个 `xhr`。
  2.  取消请求实现较为复杂，需要自己收集 `xhr`，手动调用 `xhr.abort()` 方法。

`request` 函数：

```javascript
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
```

`upload` 请求：

```javascript
// 需要外部定义一个数组存储 xhr，方便后续取消请求
let requestXhrsAndChunks = [];

// 发送 upload 请求
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
);
```

取消请求：

```javascript
requestXhrsAndChunks.forEach((item) => item.xhr.abort());
```
