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

- 缺点：耦合性太强，如果需要分段上传，要求用户连续发送同一文件切片上传请求，如果其中混入了其他文件切片，则无法合成文件。我们无法保证用户连续发送同一文件切片的行为。

但是其实引入了一个新的问题，就是请求取消之后，外部无法判断什么时候切片全部上传完了，因为切片的状态管理放在 `wrapRequest` 函数内部。

而之前则没有这个问题，之前切片的状态放在全局，我们是可以拿到切片的状态的。只要所有切片上传成功，我们就可以发起合并文件切片的请求。

而要抛出所有切片上传完成的信号，可以通过回调函数，或者是 `promise` 来实现。

- 使用回调函数来实现：我们可以将 merge 请求通过回调函数的形式传递进来，在所有文件切片上传成功之后调用该回调函数。

- 使用 `promise`：返回一个唯一的 `promise`，在所有文件切片上传成功之后，调用 `resolve` 方法。

### 封装分段上传函数

之前不管是分段上传请求还是其他请求，都是使用同一个 `request` 函数。而要实现分段上传，开发者必须自己分割文件并且连续发送分段上传的请求。所以我干脆就单独封装了一个分段上传的函数 `requestWithChunks`，与普通的请求函数 `request` 类似，只是 `options` 中的 `data` 变为了 `file`，开发者只需要将 `file` 传进来，就可以自动实现文件的分段上传。并且通过 `cancelToken` 和 `resumeToken` 抛出取消请求和继续上传的方法。

请求函数：

```javascript
// request.js

// 切片大小 1M
const SIZE = 1 * 1024 * 1024;

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
    send();

    // 暴露取消请求的方法
    if (typeof cancelToken === "function") {
      cancelToken(cancel);
    }

    // 暴露继续上传的方法
    if (typeof resumeToken === "function") {
      resumeToken(resume);
    }

    // 并行发送请求，上传文件切片
    function send() {
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

    async function resume() {
      send();
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
```

上传文件：

```javascript
// 上传文件函数
async function upload() {
  // 上传文件，将文件分段后再上传
  await requestWithChunks("http://localhost:3000/upload", {
    file: globalFile,
    cancelToken: (c) => (uploadCancel = c),
    resumeToken: (c) => (uploadResume = c),
  });

  const data = {
    filename: globalFile.name,
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
```

暂停、继续上传：

```javascript
// 暂停、取消上传函数
function pauseUpload() {
  uploadCancel();
}

// 继续上传函数
function resumeUpload() {
  uploadResume();
}
```

至此，要实现分段上传和断点续传就非常简单了。开发者只需传入一个 `file`，即可自动分段上传；只需在 `cancelToken` 和 `resumeToken` 回调函数中分别接收它抛出来的函数，就可以取消请求、继续请求，实现断点上传。

### 最后

当然 `requestWithChunks` 还是有很多缺陷，比如：要取消请求和继续请求，需要外部传入回调函数，接收取消请求和继续请求的方法，这种实现还不是特别优雅。最好是能够直接返回取消请求和继续请求的方法。但是我们必须要返回一个 promise，在请求成功的时候才能及时通知外部，继续后面的操作。

其实我们可以让 `requestWithChunks` 返回一个对象，对象中：包含了一个 promise，用来通知外部请求的状态；一个 cancel 函数，用来取消请求；一个 resume 函数，用来继续请求。

这样就可以优雅的接收取消请求和继续请求的方法了。但是吧，如果在请求成功之后，我们要做一些操作，就得这样：

```javascript
requestWithChunks(url, options).promise.then((res) => {
  /*do something*/
});
```

多了一个 promise。。。

如果不是经常取消请求，总是要在 then 方法前面加上一个 promise，就感觉有点怪。
