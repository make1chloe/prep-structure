"use client";
/** 파일 고르기 한 벌((어20) — 대전제-15 이름이 말한다) — 브라우저 기본 「Choose File · No file chosen」 대신 이름이 보이는 단추. 고르면 파일 이름이 단추에 선다. 폼은 그대로(숨은 file 칸이 같이 나간다) · 걷기의 setInputFiles 는 숨은 칸에도 든다(아이·학부모 쪽 upload.js 와 같은 손) */
import { useState } from "react";
export default function FilePick({ name = "file", accept, label = "📄 파일 고르기", ariaLabel }) {
  const [picked, setPicked] = useState("");
  return (<label className="btn sm" data-g="filepick" data-picked={picked ? "1" : "0"} style={{ cursor: "pointer", maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{picked || label}
    <input type="file" name={name} accept={accept} aria-label={ariaLabel} onChange={(e) => setPicked(e.target.files?.[0]?.name ?? "")} style={{ display: "none" }} /></label>);
}
