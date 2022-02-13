// 上传的文件
let globalFile = null;
// 取消请求的方法
let uploadCancel = null;
// 继续上传的方法
let uploadResume = null;

// 上传文件函数
async function upload() {
  // 上传文件，将文件分段后再上传
  await requestWithChunks("http://localhost:3000/upload", {
    file: globalFile,
    cancelToken: (c) => (uploadCancel = c),
    resumeToken: (r) => (uploadResume = r),
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

// 清空 input 框
function resetInput() {
  const input = document.getElementById("upload-input");
  input.value = "";
}

// 选择文件函数
function changeUploadFile(inputFile) {
  globalFile = inputFile;
}

// 暂停、取消上传函数
function pauseUpload() {
  uploadCancel();
  // TODO: 持久化保存状态，防止浏览器刷新状态丢失
}

// 继续上传函数
function resumeUpload() {
  uploadResume();
}
