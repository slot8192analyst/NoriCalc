// ===== 状態 =====
// investYen: 投資の円ぶん / investMai: 投資の枚ぶん / retMai: 回収の枚ぶん
// start: 開始時刻 "HH:MM" / end: 終了時刻 "HH:MM"
let members = [
  { name: "A", investYen: 0, investMai: 0, retMai: 0, start: "", end: "" },
  { name: "B", investYen: 0, investMai: 0, retMai: 0, start: "", end: "" },
];
let rate = 19.61;        // 円/枚（実際の計算に使う単価）
let rateMode = "yen";    // "yen" = 円単価入力 / "mai" = ○枚交換入力
const EXCH_BASE = 1000;  // ○枚交換の基準金額（円）

// 景品の額面（店舗固定値）
const PRIZE_BIG = 5000;  // 大景品 1個
const PRIZE_MID = 1000;  // 中景品 1個

const yen = n => Math.round(n).toLocaleString("ja-JP") + "円";
const signClass = n => n > 0 ? "plus" : (n < 0 ? "minus" : "");
const signYen = n => (n > 0 ? "+" : "") + yen(n);

// 現在時刻を "HH:MM" で返す
function nowHHMM(){
  const d = new Date();
  return String(d.getHours()).padStart(2,"0") + ":" + String(d.getMinutes()).padStart(2,"0");
}

// "HH:MM" を分に変換（無効なら null）
function toMinutes(t){
  if(!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h,m] = t.split(":").map(Number);
  return h*60 + m;
}

// 開始・終了から稼働時間（時間・小数）を算出。日をまたぐ場合は+24h扱い。
function hoursOf(m){
  const s = toMinutes(m.start);
  const e = toMinutes(m.end);
  if(s === null || e === null) return 0;
  let diff = e - s;
  if(diff < 0) diff += 24*60; // 日付またぎ
  return diff / 60;
}

// 各メンバーの円換算（投資・回収）
function investOf(m){ return (m.investYen||0) + (m.investMai||0) * rate; }
function retOf(m){ return (m.retMai||0) * rate; }

// 金額を景品個数に分解（大→中の順。残りは端数）
function toPrizes(amount){
  let rest = Math.round(amount);
  let big = 0, mid = 0;
  if(PRIZE_BIG > 0){ big = Math.floor(rest / PRIZE_BIG); rest -= big * PRIZE_BIG; }
  if(PRIZE_MID > 0){ mid = Math.floor(rest / PRIZE_MID); rest -= mid * PRIZE_MID; }
  return { big, mid, zandaka: rest };
}

// 景品個数をチップHTMLに
function prizeChips(p){
  const chips = [];
  if(p.big > 0) chips.push(`<span class="prize-chip">大景品 ${p.big}個</span>`);
  if(p.mid > 0) chips.push(`<span class="prize-chip">中景品 ${p.mid}個</span>`);
  if(p.zandaka > 0) chips.push(`<span class="prize-chip zandaka">端数 ${yen(p.zandaka)}</span>`);
  if(chips.length === 0) chips.push(`<span class="prize-chip">—</span>`);
  return chips.join("");
}

// ===== 描画 =====
function render(){
  renderRateUI();
  renderTags();
  renderCards();
  renderRuleNote();
  calc();
}

function renderTags(){
  const box = document.getElementById("memberTags");
  box.innerHTML = "";
  members.forEach((m, i) => {
    const tag = document.createElement("span");
    tag.className = "tag";
    tag.innerHTML = `<span>${escapeHtml(m.name)}</span><button title="削除">×</button>`;
    tag.querySelector("button").onclick = () => { members.splice(i,1); render(); };
    box.appendChild(tag);
  });
}

function renderCards(){
  const box = document.getElementById("memberCards");
  box.innerHTML = "";
  members.forEach((m, i) => {
    const pl = retOf(m) - investOf(m);
    const hrs = hoursOf(m);
    const card = document.createElement("div");
    card.className = "member-card";
    card.innerHTML = `
      <div class="member-head">
        <div class="member-name">${escapeHtml(m.name)}</div>
        <div style="display:flex;align-items:center;gap:12px;">
          <div class="member-pl">現在損益：<b class="${signClass(pl)}">${signYen(pl)}</b></div>
          <button class="x-btn" title="削除">×</button>
        </div>
      </div>
      <div class="io-grid">
        <div class="io-box">
          <div class="t">投資（円）</div>
          <div class="f"><input inputmode="numeric" data-k="investYen" value="${m.investYen||0}">円</div>
        </div>
        <div class="io-box">
          <div class="t">投資（枚）</div>
          <div class="f"><input inputmode="numeric" data-k="investMai" value="${m.investMai||0}">枚</div>
        </div>
        <div class="io-box">
          <div class="t">回収（枚）</div>
          <div class="f"><input inputmode="numeric" data-k="retMai" value="${m.retMai||0}">枚</div>
        </div>
        <div class="io-box time-box">
          <div class="t">稼働時間（開始 → 終了）</div>
          <div class="time-fields">
            <input type="time" data-k="start" value="${m.start||""}">
            <span class="time-sep">→</span>
            <input type="time" data-k="end" value="${m.end||""}">
          </div>
          <div class="time-result">稼働：<b class="js-hours">${hrs.toFixed(2)}</b> 時間</div>
        </div>
      </div>`;
    card.querySelector(".x-btn").onclick = () => { members.splice(i,1); render(); };
    card.querySelectorAll("input").forEach(inp => {
      inp.oninput = () => {
        const k = inp.dataset.k;
        if(k === "start" || k === "end"){
          members[i][k] = inp.value;
          card.querySelector(".js-hours").textContent = hoursOf(members[i]).toFixed(2);
        }else{
          members[i][k] = parseInt(inp.value.replace(/[^0-9]/g,""),10) || 0;
          const npl = retOf(members[i]) - investOf(members[i]);
          const plEl = card.querySelector(".member-pl b");
          plEl.textContent = signYen(npl);
          plEl.className = signClass(npl);
        }
        calc();
      };
    });
    box.appendChild(card);
  });
}

function renderRateUI(){
  const yenWrap = document.getElementById("rateYenWrap");
  const maiWrap = document.getElementById("rateMaiWrap");
  const note = document.getElementById("rateNote");
  const lblYen = document.getElementById("modeLabelYen");
  const lblMai = document.getElementById("modeLabelMai");

  if(rateMode === "yen"){
    yenWrap.style.display = "flex";
    maiWrap.style.display = "none";
    lblYen.classList.add("active");
    lblMai.classList.remove("active");
  }else{
    yenWrap.style.display = "none";
    maiWrap.style.display = "flex";
    lblYen.classList.remove("active");
    lblMai.classList.add("active");
  }
  note.textContent = `現在の単価：${rate.toFixed(2)}円/枚 で円換算して計算します。`;
}

function renderRuleNote(){
  const rule = document.getElementById("rule").value;
  const note = document.getElementById("ruleNote");
  if(rule === "R1"){
    note.textContent = "総回収を人数で均等に分けます。投資はそれぞれの自己負担のままです。";
  }else if(rule === "R4"){
    note.textContent = "全員の投資（負け分）はプールが全額補填し、全体の勝ち分を稼働時間の割合で分配します。全体がマイナスのときは全員で同額の負け（均等負担）になります。";
  }else{
    note.textContent = "（回収−投資）の損益を全員で等分します。投資負担も含めて平準化するため、投資差の不公平感が出にくいです。";
  }
}

// ===== 計算 =====
function calc(){
  const rule = document.getElementById("rule").value;
  const n = members.length;
  const totalInvest = members.reduce((s,m)=>s+investOf(m),0);
  const totalRet    = members.reduce((s,m)=>s+retOf(m),0);
  const totalPL     = totalRet - totalInvest;
  const totalHours  = members.reduce((s,m)=>s+hoursOf(m),0);

  document.getElementById("summary").innerHTML =
    `総投資：<b>${yen(totalInvest)}</b><br>総回収：<b>${yen(totalRet)}</b><br>総損益：<b class="${signClass(totalPL)}">${signYen(totalPL)}</b>`;

  const formula = document.getElementById("formula");
  const body = document.getElementById("resultBody");
  body.innerHTML = "";

  if(n === 0){
    body.innerHTML = `<tr><td colspan="4" class="empty">メンバーを追加してください</td></tr>`;
    document.getElementById("settle").innerHTML = `<div class="empty">—</div>`;
    document.getElementById("prizeWithdraw").innerHTML = `<div class="empty">—</div>`;
    document.getElementById("prizeInfo").textContent = "";
    formula.textContent = "";
    return;
  }

  const rows = members.map(m => {
    const personalPL = retOf(m) - investOf(m);
    let share;
    if(rule === "R1"){
      share = totalRet / n - investOf(m);
    }else if(rule === "R4"){
      if(totalPL >= 0){
        const ratio = totalHours > 0 ? hoursOf(m) / totalHours : 1 / n;
        share = totalPL * ratio;
      }else{
        share = totalPL / n;
      }
    }else{
      share = totalPL / n;
    }
    const settle = share - personalPL;
    return { name:m.name, personalPL, share, settle };
  });

  if(rule === "R1"){
    formula.textContent = `式：各人の取り分(損益) = 総回収(${yen(totalRet)}) ÷ 人数(${n}) − 自分の投資`;
  }else if(rule === "R4"){
    if(totalPL >= 0){
      formula.textContent = `式：取り分 = 全体勝ち分(${yen(totalPL)}) × 稼働時間割合（総時間 ${totalHours.toFixed(2)} 時間）`;
    }else{
      formula.textContent = `全体マイナスのため、損失(${yen(totalPL)})を人数(${n})で均等負担（全員同額の負け）`;
    }
  }else{
    formula.textContent = `式：清算後損益 = (総回収(${yen(totalRet)}) − 総投資(${yen(totalInvest)})) ÷ 人数(${n})`;
  }

  rows.forEach(r => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.name)}</td>
      <td class="${signClass(r.personalPL)}">${signYen(r.personalPL)}</td>
      <td class="${signClass(r.share)}">${signYen(r.share)}</td>
      <td class="${signClass(r.settle)}">${signYen(r.settle)}</td>`;
    body.appendChild(tr);
  });

  const transfers = buildTransfers(rows);
  renderSettlement(transfers);
  renderWithdraw(rows, transfers);
}

// ===== 送金リストを作る（最小回数マッチング）=====
function buildTransfers(rows){
  let creditors = rows.filter(r=>r.settle > 0.5).map(r=>({name:r.name, amt:r.settle}));
  let debtors   = rows.filter(r=>r.settle < -0.5).map(r=>({name:r.name, amt:-r.settle}));
  creditors.sort((a,b)=>b.amt-a.amt);
  debtors.sort((a,b)=>b.amt-a.amt);

  const transfers = [];
  let ci = 0, di = 0;
  while(ci < creditors.length && di < debtors.length){
    const c = creditors[ci], d = debtors[di];
    const pay = Math.min(c.amt, d.amt);
    transfers.push({ from:d.name, to:c.name, amount:pay });
    c.amt -= pay; d.amt -= pay;
    if(c.amt <= 0.5) ci++;
    if(d.amt <= 0.5) di++;
  }
  return transfers;
}

// ===== 精算指示の表示 =====
function renderSettlement(transfers){
  const box = document.getElementById("settle");
  if(transfers.length === 0){
    box.innerHTML = `<div class="empty">精算は不要です（全員ちょうど）</div>`;
    return;
  }
  box.innerHTML = transfers.map(t => `
    <div class="settle-line">
      <div>${escapeHtml(t.from)} → ${escapeHtml(t.to)} に <b>${yen(t.amount)}</b> 渡す</div>
      <div class="prize-detail">${prizeChips(toPrizes(t.amount))}</div>
    </div>`).join("");
}

// ===== 各メンバーの景品引き出し案内 =====
function renderWithdraw(rows, transfers){
  const box = document.getElementById("prizeWithdraw");
  document.getElementById("prizeInfo").textContent =
    `精算で他の人へ渡す金額を、各メンバーがまとめて引き出す個数です（大景品 ${yen(PRIZE_BIG)} / 中景品 ${yen(PRIZE_MID)}）。`;

  // 各メンバーが「払う側」として渡す合計と相手をまとめる
  const map = {};
  rows.forEach(r => { map[r.name] = { total:0, to:[] }; });
  transfers.forEach(t => {
    map[t.from].total += t.amount;
    map[t.from].to.push(`${t.to}へ ${yen(t.amount)}`);
  });

  const lines = rows.map(r => {
    const info = map[r.name];
    if(!info || info.total <= 0.5){
      return `
        <div class="withdraw-line">
          <div class="wname">${escapeHtml(r.name)}</div>
          <div class="wnote">引き出し不要（受け取り側）</div>
        </div>`;
    }
    const p = toPrizes(info.total);
    return `
      <div class="withdraw-line">
        <div class="wname">${escapeHtml(r.name)}：合計 ${yen(info.total)} 分を引き出す</div>
        <div class="prize-detail">${prizeChips(p)}</div>
        <div class="wnote">渡す先：${info.to.map(escapeHtml).join(" / ")}</div>
      </div>`;
  });

  box.innerHTML = lines.join("") || `<div class="empty">—</div>`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// 単価変更時はカードの損益表示も依存するため両方を再描画
function calcAndCards(){
  renderCards();
  calc();
}

// ===== イベント =====
document.getElementById("addBtn").onclick = addMember;
document.getElementById("newName").addEventListener("keydown", e => { if(e.key==="Enter") addMember(); });
document.getElementById("rule").onchange = render;

// 円単価スタイルの入力
document.getElementById("rate").oninput = (e) => {
  rate = parseFloat(e.target.value.replace(/[^0-9.]/g,"")) || 0;
  if(rate > 0){
    document.getElementById("rateExch").value = Math.round(EXCH_BASE / rate);
  }
  document.getElementById("rateNote").textContent = `現在の単価：${rate.toFixed(2)}円/枚 で円換算して計算します。`;
  calcAndCards();
};

// ○枚交換スタイルの入力
document.getElementById("rateExch").oninput = (e) => {
  const exch = parseInt(e.target.value.replace(/[^0-9]/g,""),10) || 0;
  rate = exch > 0 ? EXCH_BASE / exch : 0;
  document.getElementById("rate").value = rate.toFixed(2);
  document.getElementById("rateNote").textContent =
    `${exch}枚交換 → 単価：${rate.toFixed(2)}円/枚（${EXCH_BASE}円あたり）で計算します。`;
  calcAndCards();
};

// トグル切り替え
document.getElementById("rateMode").onchange = (e) => {
  rateMode = e.target.checked ? "mai" : "yen";
  renderRateUI();
};

// 新規メンバー追加（終了時刻は現在時刻をデフォルトに）
function addMember(){
  const inp = document.getElementById("newName");
  const name = inp.value.trim() || String.fromCharCode(65 + members.length);
  members.push({ name, investYen:0, investMai:0, retMai:0, start:"", end:nowHHMM() });
  inp.value = "";
  render();
}

// 初期メンバーの終了時刻に現在時刻をセット
members.forEach(m => { if(!m.end) m.end = nowHHMM(); });

render();
