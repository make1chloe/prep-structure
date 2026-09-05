// 목업 파일은 <title>부터 시작한다(아티팩트가 뼈대를 씌운다). 검사·캡처용으로 뼈대를 씌운 preview.html 을 만든다.
import fs from "fs";
const body = fs.readFileSync(new URL("./클로이영어-화면-목업.html", import.meta.url), "utf8");
fs.writeFileSync("preview.html", `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>${body}</body></html>`);
console.log("preview.html", (body.length / 1024).toFixed(0) + "K");
