/** 📢 공지 카드(아이 07 · 학부모 09 — 4단계-6) — 제목 · 날짜·반/학교 · 본문 · 📎 · 안 읽은 것은 새 표시. 카드 틀(Card)은 그 화면 것을 받아 쓴다(두 벌로 안 그린다) */
export default function NoticeCard({ Card, lines = [], unread = 0, fold = null, folded = false }) {
  return <Card emo="📢" title="공지" id="notice" fold={fold} folded={folded} pill={unread ? `새 ${unread}` : String(lines.length)}>
    {lines.map((n) => <div className="li" key={n.id} data-g="notice-line" data-unread={n.unread ? "1" : "0"}><div><b>{n.unread ? "🆕 " : ""}{n.title}</b><small>{n.small}</small>
      {n.body && <p className="note" style={{ margin: "4px 0 0", whiteSpace: "pre-wrap", color: "var(--ink)" }}>{n.body}</p>}
      {n.files.length > 0 && <div className="tags" style={{ marginTop: 4 }}>{n.files.map((f) => <a key={f.id} className="tag" href={`/api/files/${f.id}`} target="_blank" rel="noreferrer" data-g="notice-file">📎 {f.orig_name}</a>)}</div>}</div></div>)}
  </Card>;
}
