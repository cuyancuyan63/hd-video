const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { enhanceVideo } = require("./enhanceVideo");

const app = express();

app.disable("x-powered-by");

if (!fs.existsSync("./tmp")) {
fs.mkdirSync("./tmp", { recursive: true });
}

const upload = multer({
dest: "./tmp",
limits: {
fileSize: 100 * 1024 * 1024 // 100MB
}
});

let processing = false;
const queue = [];

async function processQueue() {
if (processing) return;
if (queue.length === 0) return;

processing = true;

const job = queue.shift();

try {
const result = await enhanceVideo(job.filePath);

if (fs.existsSync(job.filePath)) {
  fs.unlinkSync(job.filePath);
}

job.resolve({
  status: true,
  url: result.Result_url
});

} catch (err) {

if (fs.existsSync(job.filePath)) {
  fs.unlinkSync(job.filePath);
}

job.reject(err);

} finally {
processing = false;
processQueue();
}
}

app.get("/", (req, res) => {
res.json({
status: true,
service: "DanzClean Unblur Worker",
queue: queue.length,
processing
});
});

app.get("/status", (req, res) => {
res.json({
status: true,
queue: queue.length,
processing
});
});

app.post("/unblur", upload.single("video"), async (req, res) => {
try {

if (!req.file) {
  return res.status(400).json({
    status: false,
    message: "Video tidak ditemukan"
  });
}

const result = await new Promise((resolve, reject) => {

  queue.push({
    filePath: req.file.path,
    resolve,
    reject
  });

  processQueue();

});

return res.json(result);

} catch (err) {

return res.status(500).json({
  status: false,
  error: err.message
});

}
});

app.use((err, req, res, next) => {

if (req.file?.path && fs.existsSync(req.file.path)) {
fs.unlinkSync(req.file.path);
}

return res.status(500).json({
status: false,
error: err.message
});

});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
console.log("Worker running on port ${PORT}");
});