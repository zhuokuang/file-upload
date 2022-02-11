### 前端：

- `HTML、CSS、JavaScript`

- `Blob.slice, FormData` 实现文件切片

- `xhr` 发送请求

### 后端

- `Node.js`

- `multiparty` 处理文件切片

- `stream` 合并切片文件

### 采坑记录：

1. 使用文件形式直接在浏览器打开，不要使用 live server 插件。因为上传文件切片的时候，会创建临时文件夹并写入数据，live server 监听到项目中有文件写入，会强制浏览器刷新，然后取消请求，导致一些文件切片接收不到。

2. 合并文件切片的时候，使用 stream 不能直接往不存在的文件夹下面写入数据，否则不能触发 readStream 的 end 事件，也没有报错信息。
