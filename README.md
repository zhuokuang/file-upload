## 前端：

- `HTML、CSS、JavaScript`

- `Blob.slice, FormData` 实现文件切片

- `xhr` 发送请求

## 后端

- `Node.js`

- `multiparty` 处理文件切片

- `stream` 合并切片文件

## start

1. 安装依赖

```
npm install
```

2. 运行下面命令（启动后端服务，监听请求；打包 html 资源）

```
npm run start
```

3. 使用浏览器打开如下网址

```
http://localhost:8080/index.html
```

## 断点续传

原理：断点续传的原理在于记录状态。需要将已上传的文件切片和未上传的文件切片记录下来。

这里有两种解决方案，第一种使用前端记录状态；第二种使用服务端记录状态。

前端记录状态：状态保存在前端，**换浏览器上传状态丢失**。

服务端记录状态：状态保存在服务端，在上传文件切片前，需要发送请求验证。若服务端已存在文件切片，则不上传该文件切片，否则上传该文件切片。

本例子使用前端记录状态，因为服务端记录状态在每次上传文件切片前都需额外发送请求，并且要验证文件切片是否存在，需要计算文件切片的哈希值，比较耗费时间，所以使用前端记录状态。

在用户暂停上传时，取消请求，将未上传成功的文件切片保存至数组中；继续上传时，只需继续上传未上传成功的文件切片。

## 采坑记录：

1. 如果使用文件形式直接在浏览器打开，不要使用 live server 插件。因为上传文件切片的时候，会创建临时文件夹并写入数据，live server 监听到项目中有文件写入，会强制浏览器刷新，然后取消请求，导致一些文件切片接收不到。**（已解决，不需要使用文件形式打开，按照上面的命令就可以跑起来）**

2. 合并文件切片的时候，使用 stream 不能直接往不存在的文件夹下面写入数据，否则不能触发 readStream 的 end 事件，也没有报错信息。
