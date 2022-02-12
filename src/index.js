// 划分之后的切片文件，数组
let requestXhrsAndChunks = [];
// 上传的文件名
let filename = "filename";
// 切片大小 10M
const SIZE = 1 * 1024 * 1024;

const {
  request: uploadRequest,
  cancel: uploadCancel,
  resume: uploadResume,
} = wrapRequest(true);
const { request } = wrapRequest();

// 将文件划分为切片
function splitChunks(file, size = SIZE) {
  const fileChunks = [];
  for (let i = 0; i < file.size; i += size) {
    fileChunks.push(file.slice(i, i + size));
  }
  return fileChunks;
}

// 上传文件切片函数
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
    .map((data) => uploadRequest("http://localhost:3000/upload", { data }));

  await Promise.all(requests);

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

function pauseUpload() {
  uploadCancel();
  // TODO: 持久化保存状态，防止浏览器刷新状态丢失
}

function resumeUpload() {
  uploadResume();
}
