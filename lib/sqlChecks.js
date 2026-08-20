// SQL(마이그레이션)마다 **확인하는 법** — 한 곳에만 둔다.
//
// 설정 → SQL 화면(checkSchema)과 메뉴 배지(lib/sqlBadge)가 같은 목록을
// 본다. 두 벌이면 화면은 「다 됐음」 인데 배지는 「2」 인 날이 온다.
// 새 SQL 을 만들면 **반드시** 여기 한 줄 적는다 — 안 적으면 화면도
// 배지도 그 SQL 을 모른다 (0097 때 실제로 그랬다).

export const CHECKS = [
  { id: "0009", label: "공지 · 전달사항", table: "notices", col: "id" },
  { id: "0013", label: "숙제 문자 · 발송 이력", table: "report_sends", col: "kind" },
  { id: "0017", label: "문자 문구 · 신규 상담", table: "message_templates", col: "body" },
  { id: "0020", label: "할일 분류", table: "todo_categories", col: "name" },
  { id: "0022", label: "2026 시험 일정", table: "exam_periods", col: "english_on" },
  { id: "0023", label: "리포트 댓글", table: "report_comments", col: "body" },
  { id: "0024", label: "경고 · 늦귀가 과제", table: "stay_tasks", col: "status" },
  { id: "0025", label: "단어시험 방식", table: "word_test_settings", col: "first_hint" },
  { id: "0026", label: "회독별 진도", table: "student_unit_progress", col: "round" },
  { id: "0027", label: "하원 안내", table: "daily_reports", col: "late_until" },
  { id: "0028", label: "숙제 → 내 할일", table: "homework_items", col: "prep_task" },
  { id: "0029", label: "문자 문구 종류별", table: "message_templates", col: "key" },
  { id: "0030", label: "알림톡 연결", table: "message_templates", col: "alimtalk_id" },
  { id: "0031", label: "월간리포트 · 단원평가", table: "monthly_reports", col: "ym" },
  { id: "0033", label: "학생 타이머", table: "study_sessions", col: "seconds" },
  { id: "0034", label: "등원 학습 · 학습 완료", table: "study_sessions", col: "kind" },
  { id: "0035", label: "학습 루틴", table: "routine_steps", col: "sort" },
  { id: "0037", label: "단어시험 시점", table: "students", col: "word_when" },
  { id: "0038", label: "등원 체크 (학생이 누름)", table: "arrival_checks", col: "phone_at" },
  { id: "0039", label: "등원 체크 · 출석", table: "arrival_checks", col: "attend_at" },
  { id: "0041", label: "학원에서만 등원 체크", table: "academy_net", col: "ip" },
  { id: "0042", label: "특강 기한", table: "classes", col: "ends_on" },
  { id: "0042", label: "반별 출결 (특강)", table: "class_attendance", col: "status" },
  { id: "0043", label: "학생 계정 연결", table: "student_link_codes", col: "code" },
  { id: "0044", label: "숙제 제출", table: "homework_submissions", col: "kind" },
  { id: "0045", label: "학생 아이디 로그인", table: "students", col: "login_id" },
  { id: "0045", label: "체크리스트 숙제", table: "homework_items", col: "checklist" },
  { id: "0046", label: "보강 시간", table: "attendance", col: "makeup_time" },
  // 표·칸이 아니라 **함수**로 확인한다 (저장소 권한이 이 함수에 걸려 있다)
  { id: "0047", label: "숙제 파일 권한", rpc: "my_student_id" },
  { id: "0048", label: "숙제로 낼 때 바뀌는 학습", table: "homework_items", col: "home_item_id" },
  { id: "0049", label: "상담일지", table: "student_notes", col: "raw" },
  { id: "0049", label: "본보기 문장", table: "comment_samples", col: "body" },
  { id: "0050", label: "학생공지 · 부모님공지", table: "daily_reports", col: "notice_student" },
  { id: "0051", label: "문제번호 단원", table: "textbook_units", col: "question_no" },
  { id: "0052", label: "내신 자료 관리", table: "prep_materials", col: "need_card" },
  { id: "0053", label: "내신 자료 종류", table: "prep_material_types", col: "need_card" },
  { id: "0054", label: "내신 자료 순서", table: "prep_assignments", col: "sort" },
  { id: "0055", label: "수납 (결제선생)", table: "payments", col: "paid_on" },
  { id: "0056", label: "오래된 제출물 정리", table: "homework_submissions", col: "purged_at" },
  { id: "0057", label: "반 명단 잠그기 (보안)", rpc: "my_class_ids" },
  { id: "0058", label: "안 보내기", table: "daily_reports", col: "skip_kinds" },
  { id: "0059", label: "나이스 학사일정", table: "schools", col: "schul_code" },
  { id: "0060", label: "시험 일정 숨기기", table: "exam_periods", col: "hidden" },
  { id: "0062", label: "검사 한 줄", table: "daily_report_items", col: "check_note" },
  { id: "0063", label: "직접검사 숙제", table: "homework_items", col: "in_person" },
  { id: "0064", label: "공지 사진", table: "notices", col: "photos" },
  { id: "0065", label: "영상 배정 · 본 기록", table: "videos", col: "id" },
  { id: "0066", label: "달력 나누기", table: "tasks", col: "private" },
  { id: "0067", label: "메뉴 고르기", table: "profiles", col: "menu_hidden" },
  { id: "0068", label: "학부모가 보내는 사진", table: "requests", col: "photos" },
  { id: "0069", label: "학교 지역·주소", table: "schools", col: "address" },
  { id: "0070", label: "단어 개수 · 단어시험 설정", table: "students", col: "word_cut_pct" },
  { id: "0071", label: "형제자매 묶기", table: "students", col: "family_id" },
  { id: "0072", label: "성적 (내신 · 모의고사)", table: "scores", col: "cuts" },
  { id: "0073", label: "시험 회차별 등급컷", table: "exam_periods", col: "cuts" },
  { id: "0074", label: "시험 한 줄로 합치기 (범위·자료·출제샘)", table: "exam_periods", col: "teacher" },
  { id: "0075", label: "내 시험에 나이스 붙이기", table: "exam_periods", col: "neis_source_id" },
  { id: "0076", label: "학교 한 곳으로 · 출제샘 여러 명", table: "exam_periods", col: "teachers" },
  { id: "0077", label: "일정을 학생·학교에 배정", table: "tasks", col: "deliver_student_ids" },
  { id: "0078", label: "구글 캘린더 구독", table: "calendar_tokens", col: "token" },
  { id: "0079", label: "학부모 계정 · 선생님 권한", table: "profiles", col: "login_id" },
  { id: "0080", label: "로고 올리기", table: "app_assets", col: "data" },
  { id: "0081", label: "아이콘을 로그인 없이 받기", anonTable: "app_assets", col: "key" },
  { id: "0082", label: "되풀이 할일", table: "todo_routines", col: "repeat_kind" },
  { id: "0083", label: "신규 학생 · 교재 끝나감 할일", table: "todo_routines", col: "lead_units" },
  { id: "0084", label: "지금 뭐 하는 중 (실시간)", table: "student_activity", col: "state" },
  { id: "0085", label: "학생이 자기 상태 누르기", table: "student_activity", col: "by_student" },
  { id: "0087", label: "바뀐 숙제 표시", table: "daily_report_items", col: "changed_at" },
  // 0088 은 로그인 함수를 고친다 — 표·칸이 아니라 함수라 rpc 로 확인한다.
  //   학부모 계정을 만들어도 로그인이 안 되던 것을 고친 것이다.
  { id: "0088", label: "학부모도 아이디로 로그인", rpc: "login_lookup_v2" },
  { id: "0089", label: "수업 가이드 링크", table: "class_guides", col: "url" },
  // 0090 은 표·칸이 아니라 **읽기 규칙**을 고친다. 그래서 표식 함수의 있고 없음으로 본다.
  //   이게 없으면 학부모 화면이 통째로 비어 보인다 (오류도 안 난다).
  { id: "0090", label: "학부모도 수업 기록 읽기", rpc: "parent_reads_reports" },
  // 0091 도 읽기 규칙이라 표·칸으로는 못 본다 — 함수의 있고 없음으로 본다.
  //   이게 없으면 남의 학교 학사일정이 우리 아이 달력에 그대로 뜬다.
  // 0091·0092 는 둘 다 읽기 규칙이라 표·칸으로는 못 본다 — 표식 함수로 본다.
  //   0092 가 0091 을 덮어쓰므로 표식도 0092 것만 남는다 (0091 은 따로 안 센다).
  { id: "0092", label: "일정은 고른 대상에게만 (안 고르면 안 보임)", rpc: "task_audience_on" },
  { id: "0093", label: "화면 안내 문구 (직접 적기)", table: "screen_notes", col: "body" },
  { id: "0095", label: "화면 구성 순서 (직접 정하기)", table: "screen_layouts", col: "order_keys" },
  // 0096 은 읽기 규칙이라 표·칸으로는 못 본다 — **로그인한 학생 눈으로** 물어본다.
  //   원장님 계정으로는 원래 읽히니 이 검사가 통과해도 학생이 못 읽을 수 있는데,
  //   그건 checkSchema 가 원장님 세션으로 도는 한 어쩔 수 없다.
  //   실제 확인은 scripts/check-parent.sh 가 진짜 Postgres 에서 한다.
  { id: "0096", label: "휴강 · 회차를 학생도 읽기", rpc: "holidays_visible" },
  // ── 성적을 문항까지 (2026-08-06) ────────────────────────────
  //
  //   **여기에 안 적으면 화면이 거짓말을 한다.** 실제로 0097~0101 을 안 적어둬서
  //   「75/75 · 넣을 것이 없습니다」 가 떴다 — 아직 하나도 안 돌렸는데도.
  //   새 SQL 을 만들면 **반드시** 이 목록에 한 줄 적는다.
  { id: "0097", label: "문항별 오답 · 문항표", table: "score_items", col: "no" },
  { id: "0097-2", label: "시험지 문항 (출제분석)", table: "exam_questions", col: "unit" },
  { id: "0097-3", label: "학원 기본 문항표", table: "exam_spec_rows", col: "topic" },
  { id: "0097-4", label: "성적에 시험 회차 · 아이가 적은 것", table: "scores", col: "self_note" },
  // 0098 은 표를 옮기고 읽기 규칙을 고친다 — 새로 생긴 칸으로 본다.
  //   이게 없으면 **성적 화면의 「틀린 문제」 가 안 열린다** (표를 옮겼기 때문).
  { id: "0098", label: "틀린 문제 한 표로 · 아이가 직접 적기", table: "score_items", col: "label" },
  { id: "0099", label: "단원평가를 오늘 수업에서", table: "daily_reports", col: "sent_unit" },
  { id: "0100", label: "단원의 분량 · 내용", table: "textbook_units", col: "question_count" },
  { id: "0101", label: "성적 공개 대상", table: "students", col: "score_share" },
  { id: "0102", label: "신규 상담 양식 (희망 시간표 · 개인정보 동의)", table: "inquiries", col: "want_slots" },
  { id: "0103", label: "보강 없음", table: "attendance", col: "makeup_waived" },
  { id: "0104", label: "학생이 부르면 선생님 폰에 알림", rpc: "staff_push_on" },
  { id: "0105", label: "방해금지 시간 · 알림 확인 기록", rpc: "push_prefs_on" },
  { id: "0106", label: "쉬는 시간 · 단원평가 결과 내기", rpc: "breaks_on" },
  { id: "0107", label: "보강 일정 확정 · 변경 요청", rpc: "makeup_confirm_on" },
  { id: "0108", label: "전달사항 답장 여러 번 · 보낸 쪽 취소", rpc: "request_thread_on" },
  { id: "0109", label: "신규 문의 문자 (설문지 링크 · 일정 안내)", rpc: "inquiry_sms_on" },
  // 0110 이 없으면 **학생·학부모만** 알림을 못 켠다 (원장님은 켜진다).
  //   그래서 설정 화면만 보면 다 된 것처럼 보인다 — 꼭 확인해야 하는 줄이다.
  { id: "0110", label: "학생·학부모도 알림 켜기 (공개키 읽기)", rpc: "push_public_key_on" },
  // 0111 이 없으면 **안 되는 폰에서 직접 확인할 방법**이 없다 —
  //   학생·학부모는 자기에게 테스트 알림도 못 보낸다
  { id: "0111", label: "내 폰에 테스트 알림 (학생·학부모도)", rpc: "self_push_on" },
  // 안 본 시험을 「시험 없음」 으로 치울 자리 — 없으면 배지가 영영 안 꺼진다
  { id: "0112", label: "시험 없음 (안 본 회차 치우기)", table: "exam_skips", col: "exam_id" },
  // 할일 칸반의 가운데 칸 — 없으면 칸반이 두 칸(할일·완료)으로만 선다
  { id: "0113", label: "할일 칸반 「진행중」", rpc: "task_started_on" },
  // 없으면 **로그인 없는 상담 신청 설문지**에서만 학교를 손으로 적게 된다 —
  //   갈라짐이 시작되는 첫 자리라 여기가 제일 아프다
  { id: "0114", label: "학교 골라 넣기 (설문지 포함)", rpc: "school_names_on" },
  // 나이스에 없는 시험을 학교 홈페이지에서 찾아오려면 주소를 적어둘 자리가 필요하다
  //   (학교는 나이스와 홈페이지 두 군데에 따로 적고, 서로 다르다 — 2026-08-10)
  { id: "0115", label: "학교 홈페이지에서 일정 가져오기", rpc: "school_homepage_on" },
  { id: "0116", label: "학습 항목의 준비물 (교재·클래스카드·노트)", table: "homework_items", col: "tool" },
  { id: "0117", label: "할일 하위목록 (체크리스트)", rpc: "task_checklist_on" },
  { id: "0118", label: "이해도 (집중도 옆에)", table: "daily_reports", col: "understanding" },
  { id: "0119", label: "단원 메모 (완료 취소해도 메모가 남게)", rpc: "unit_note_on" },
  { id: "0120", label: "루틴 단계를 번호 아닌 id 로 (중간 수정해도 학생이 안 밀리게)", rpc: "routine_step_id_on" },
  { id: "0121", label: "공지 수정 (고치면 확인했던 사람에게도 다시 뜸)", rpc: "notice_edit_on" },
  { id: "0122", label: "신규 상담에 교재 배정 (등록 전에도)", rpc: "inquiry_books_on" },
  { id: "0123", label: "다음 달 일정 확정 (학부모 1차 확인 · 원장 확정)", rpc: "month_confirm_on" },
  { id: "0124", label: "단어 교재 — 한 번에 몇 단원씩", rpc: "word_units_on" },
  { id: "0125", label: "교재 안내 나간 날 — 미안내 확인 목록", rpc: "book_notified_on" },
  { id: "0126", label: "예약 발송 — 보낼 것 화면", rpc: "scheduled_sends_on" },
  { id: "0127", label: "시작일 두 칸 합치기 (등원시작일 하나로)", rpc: "start_on_merged" },
  { id: "0128", label: "상담 교재 — 안내한 사용 예정일 보존", rpc: "inquiry_book_start_on" },
  { id: "0129", label: "공지 — 확인 누르면 더 안 보이게", rpc: "notice_read_on" },
  { id: "0131", label: "클래스카드 연동 — 플래너 읽기 저장소", rpc: "classcard_on" },
  { id: "0132", label: "클카 자동 판정 — 한 달 그림자 기록", rpc: "classcard_shadow_on" },
  { id: "0133", label: "학생별 빼는 활동 (워크북 빼기)", rpc: "skip_acts_on" },
  { id: "0134", label: "진도에 마지막으로 만진 날 (오늘 수업 자동 반영)", rpc: "progress_marked_on" },
  { id: "0135", label: "루틴 회독 분기 (n회독부터 다른 루틴)", rpc: "routine_round_on" },
  { id: "0136", label: "루틴 예습 숙제 (다음 단원 선행)", rpc: "routine_home_next_on" },
  { id: "0137", label: "영역별 루틴 (교재별이 우선)", rpc: "routine_area_on" },
  { id: "0138", label: "활동 → 학습항목 연결 (숙제로 담을 곳)", rpc: "act_items_on" },
  { id: "0139", label: "루틴 항목별 주의사항 (배정 메모로)", rpc: "routine_item_notes_on" },
  { id: "0140", label: "오늘 학원 학습 순서 · 다음 수업 이월", rpc: "inclass_order_on" },
  { id: "0141", label: "안 해온 숙제의 기본 처분", rpc: "redo_default_on" },
  { id: "0142", label: "전달사항 처리 완료", rpc: "request_done_on" },
  { id: "0143", label: "날짜 미정 일정", table: "tasks", col: "date_tbd" },

  // 0086 은 실시간 발행만 건드린다 — 표·칸으로는 확인할 수가 없다.
  // 확인은 오늘 수업 화면 오른쪽 위의 「● 실시간」 으로 한다.
];
