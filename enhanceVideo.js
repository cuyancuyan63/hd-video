
const axios = require("axios");
const FormData = require("form-data");
const crypto = require("crypto");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");

const API = "https://api.unwatermark.ai";
const WEB = "https://unblurimage.ai";

const RESOLUTION = "2k";
const IS_PREVIEW = "false";

const UA =
"Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Mobile Safari/537.36";

const PRODUCT_CODE = "067003";

let PRODUCT_SERIAL = randomProductSerial();

function randomProductSerial() {
const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
let out = "";

for (let i = 0; i < 6; i++) {
out += chars[crypto.randomInt(chars.length)];
}

return out;
}

function extToMime(file) {
const ext = path.extname(file).toLowerCase();

if (ext === ".mp4") return "video/mp4";
if (ext === ".mov") return "video/quicktime";
if (ext === ".webm") return "video/webm";
if (ext === ".mkv") return "video/x-matroska";

return "application/octet-stream";
}

function headers(extra = {}) {
return {
accept: "/",
origin: WEB,
referer: "${WEB}/",
"user-agent": UA,
"product-code": PRODUCT_CODE,
"product-serial": PRODUCT_SERIAL,
"x-request-id": crypto.randomUUID(),
...extra
};
}

async function postForm(endpoint, fields) {
const form = new FormData();

for (const [key, value] of Object.entries(fields)) {
form.append(key, value);
}

const res = await axios.post(
"${API}${endpoint}",
form,
{
headers: headers(form.getHeaders()),
validateStatus: () => true
}
);

return {
status: res.status,
data: res.data
};
}

async function getJson(endpoint) {
const res = await axios.get(
"${API}${endpoint}",
{
headers: headers({
"content-type": "application/json; charset=UTF-8"
}),
validateStatus: () => true
}
);

return {
status: res.status,
data: res.data
};
}

async function createUploadUrl(filePath) {
const fileName = path.basename(filePath);

const result = await postForm(
"/api/web/common/upload/video",
{
video_file_name: fileName
}
);

if (
result.status >= 400 ||
result.data?.code !== 100000
) {
throw new Error(
JSON.stringify(result.data)
);
}

return result.data.result;
}

async function uploadVideo(uploadUrl, filePath) {
const stat =
await fsp.stat(filePath);

const mime =
extToMime(filePath);

const res = await axios.put(
uploadUrl,
fs.createReadStream(filePath),
{
headers: {
"content-type": mime,
"content-length": stat.size
},
maxBodyLength: Infinity,
maxContentLength: Infinity,
validateStatus: () => true
}
);

return res.status;
}

async function createJob(originalVideoUrl) {
const result = await postForm(
"/api/web/unblurimage/v1/video-enhancer/create-job",
{
original_video_url: originalVideoUrl,
resolution: RESOLUTION,
is_preview: IS_PREVIEW
}
);

if (
result.status >= 400 ||
!result.data?.result?.job_id
) {
throw new Error(
JSON.stringify(result.data)
);
}

return result.data.result;
}

async function getJob(jobId) {
return await getJson(
"/api/web/unblurimage/v1/video-enhancer/get-job/${jobId}"
);
}

function sleep(ms) {
return new Promise(resolve =>
setTimeout(resolve, ms)
);
}

async function waitJob(
jobId,
maxTry = 80,
delay = 5000
) {
for (let i = 0; i < maxTry; i++) {

const result =
  await getJob(jobId);

const output =
  result.data?.result?.output_url;

if (
  Array.isArray(output) &&
  output.length
) {
  return output[0];
}

await sleep(delay);

}

throw new Error("Job timeout");
}

async function enhanceVideo(filePath) {

const upload =
await createUploadUrl(filePath);

const signedUrl =
upload.url;

const publicUrl =
upload.url.split("?")[0];

const uploaded =
await uploadVideo(
signedUrl,
filePath
);

if (uploaded >= 400) {
throw new Error(
"Upload gagal (${uploaded})"
);
}

const job =
await createJob(publicUrl);

const resultUrl =
await waitJob(job.job_id);

return {
Result_url: resultUrl
};
}

module.exports = {
enhanceVideo
};
