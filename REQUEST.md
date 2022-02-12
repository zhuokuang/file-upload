## request 优化记录

### 请求时直接暴露 `xhr`

- 缺点：

  1. `request` 函数直接改变外部数组，函数不纯。
  2. `request` 函数无法复用，每发送一次请求，都会将请求的 `xhr` 暴露出来。

`request` 请求：

```javascript
// 全局定义一个数组，保存所有请求的 xhr
const xhrList = [];

/**
 * 请求函数，使用 promise 封装，xhr 实现
 * @param {*} url 请求路径
 * @param {*} options 请求配置参数
 */
function request(url, { method = "POST", data, headers = {} }) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    Object.keys(headers).forEach((key) => {
      const value = headers[key];
      xhr.setRequestHeader(key, value);
    });
    xhr.send(data);

    // 将 xhr 暴露在外部数组中，直接改变了外部数组
    xhrList.push(xhr);

    // 请求成功的回调
    xhr.onload = function (e) {
      // console.log('success', e.target)
      resolve(e.target);

      // 请求成功之后，将对应的 xhr 从外部数组中删除
      xhrList.splice(
        xhrList.findIndex((item) => item === xhr),
        1
      );
    };

    // 请求失败的回调
    xhr.onerror = function (e) {
      // console.log('error', e.target);
      reject(e.target);
    };
  });
}
```

`upload` 请求（上传切片文件）：

```javascript
// 发送 upload 请求
xhrList
  .map(({ chunk, hash }) => {
    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("hash", hash);
    formData.append("name", filename);
    return formData;
  })
  // 先上传切片，上传完再合并
  .map((data, index) => request("http://localhost:3000/upload", { data }));
```

取消请求：

```javascript
function pause() {
  xhrList.forEach((xhr) => xhr.abort());
}
```

为了防止在 request 函数中直接改变外部数组，以及解决 request 函数无法复用的问题，进行了如下优化。

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

`upload` 请求（上传切片文件）：

```javascript
// 需要外部定义一个数组存储 xhr，方便后续取消请求
let requestXhrsAndChunks = [];

// 发送 upload 请求
requestXhrsAndChunks
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
```

取消请求：

```javascript
function pause() {
  requestXhrsAndChunks.forEach((item) => item.xhr.abort());
}
```

其实使用回调函数暴露出 `xhr` 还是有很多问题的。因为我们无法保证用户拿到 `xhr` 之后会干什么，。用户只是想要取消请求，而我们却把整个 `xhr` 暴露出来。这样，用户可能会用这些 `xhr` 去做其他事情，这是我们无法保证的。

最好的解决方法应该是：xhr 由内部保存，用户获取不到，我们只抛给用户一个取消请求的方法。

### 内部管理 `xhr`，并抛出取消请求的方法

封装请求函数：

```javascript
// request.js
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
```

发送请求：

```javascript
// 获取发送请求的函数、取消请求的函数、继续上传的函数
const {
  request: uploadRequest,
  cancel: uploadCancel,
  resume: uploadResume,
} = wrapRequest(true);

// 发送上传文件切片请求，点击 upload 按钮是触发
const requests = requestXhrsAndChunks
  .map(({ chunk, hash }) => {
    const formData = new FormData();
    formData.append("chunk", chunk);
    formData.append("hash", hash);
    formData.append("name", filename);
    return formData;
  })
  // 先上传切片，上传完再合并
  .map((data) => uploadRequest("http://localhost:3000/upload", { data }));

// 暂停上传文件切片请求，点击 pause 按钮时触发
function pauseUpload() {
  uploadCancel();
}

// 继续上传文件切片请求，点击 resume 按钮时触发
function resumeUpload() {
  uploadResume();
}
```

这样看起来就好很多了。

文件切片状态由 `wrapRequest` 函数管理，只需要在调用 `wrapRequest` 函数的时候传入一个 `true`，它就会返回一个**请求函数、暂停上传函数、继续上传函数**。用户只需要在需要的地方分别调用暂停上传函数、继续上传函数，就可以实现暂停上传和继续上传的功能。

并且由 `wrapRequest` 函数返回的 `request` 函数也可以用于其他请求，只需要在调用 `wrapRequest` 函数时传入 `false`，`wrapRequest` 函数内部就不会收集发送请求的 `xhr`，这样由 `request` 发送的请求就不会被取消了。

### 最后

当然这个 `request` 方法还是有很多不足的地方。

比如：调用一次 `wrapRequest` 方法，会返回一个 `request` 方法和一个 `cancel` 方法，如果调用 `cancel` 方法，只能一次性取消这个 `request` 方法发送的所有请求。如果是多文件上传，需要取消其中某个文件的上传，取消其中某些请求，则只能多次调用 `wrapRequest` 方法，让不同文件的上传使用不同的 `request` 方法。
