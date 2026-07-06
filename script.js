// ===== 状態 =====
const DEFAULT_START = "09:00";   // よく行く店の開店時刻（遅刻時は手動変更）

// 時刻ドロップダウンの設定
const HOUR_START = 6;    // 時プルダウンの最小
const HOUR_END   = 25;   // 時プルダウンの最大（25 = 翌1時まで想定）
const MIN_STEP   = 5;    // 分の刻み

let members = [
  { name: "A", investYen: 0, investMai: 0, retMai: 0, start: DEFAULT_START, end: "" },
  { name: "B", investYen: 0, investMai: 0, retMai: 0, start: DEFAULT_START, end: "" },
];
let rate = 19.61;
let rateMode = "mai";
const EXCH_BASE = 1000;

const PRIZE_BIG = 5000;
const PRIZE_MID = 1000;

const yen = n => Math.round(n).toLocaleString("ja-JP") + "円";
const signClass = n => n > 0 ? "plus" : (n < 0 ? "minus" : "");
const signYen = n => (n > 0 ? "+" : "") + yen(n);

function settleLabel(n){
  if(n > 0.5) return "受取";
  if(n < -0.5) return "支払";
  return "ちょうど";
}

function groupNum(n){
  return (n && n > 0) ? Number(n).toLocaleString("ja-JP") : "";
}

// 現在時刻を最も近い5分に丸めて "HH:MM" で返す
function nowHHMM(){
  const d = new Date();
  let total = d.getHours() * 60 + d.getMinutes();
  total = Math.round(total / 5) * 5;      // 5分刻みで四捨五入
  total = total % (24 * 60);              // 23:58→24:00 などを 00:00 に桁上げ処理
  const h = Math.floor(total / 60);
  const m = total % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}

// "HH:MM" を { h, m } に分解（未設定なら null）
function splitTime(t){
  if(!t || !/^\d{1,2}:\d{2}$/.test(t)) return { h:null, m:null };
  const [h, m] = t.split(":").map(Number);
  return { h, m };
}

// 時プルダウンの <option> 群を生成
function hourOptions(selected){
  let out = `<option value=""${selected===null?" selected":""}>--</option>`;
  for(let h = HOUR_START; h <= HOUR_END; h++){
    const label = String(h % 24).padStart(2,"0");
    out += `<option value="${h % 24}"${selected===(h%24)?" selected":""}>${label}</option>`;
  }
  return out;
}

// 分プルダウンの <option> 群を生成（5分刻み）
function minuteOptions(selected){
  let out = `<option value=""${selected===null?" selected":""}>--</option>`;
  for(let m = 0; m < 60; m += MIN_STEP){
    const label = String(m).padStart(2,"0");
    out += `<option value="${m}"${selected===m?" selected":""}>${label}</option>`;
  }
  return out;
}

function toMinutes(t){
  if(!t || !/^\d{1,2}:\d{2}$/.test(t)) return null;
  const [h,m] = t.split(":").map(Number);
  return h*60 + m;
}

function hoursOf(m){
  const s = toMinutes(m.start);
  const e = toMinutes(m.end);
  if(s === null || e === null) return 0;
  let diff = e - s;
  if(diff < 0) diff += 24*60;
  return diff / 60;
}

function investOf(m){ return (m.investYen||0) + (m.investMai||0) * rate; }
function retOf(m){ return (m.retMai||0) * rate; }

function toPrizes(amount){
  let rest = Math.round(amount);
  let big = 0, mid = 0;
  if(PRIZE_BIG > 0){ big = Math.floor(rest / PRIZE_BIG); rest -= big * PRIZE_BIG; }
  if(PRIZE_MID > 0){ mid = Math.floor(rest / PRIZE_MID); rest -= mid * PRIZE_MID; }
  return { big, mid, zandaka: rest };
}

// 景品個数をチップHTMLに（アイコン＋名前 ×個数）
function prizeChips(p){
  const chips = [];
  if(p.big > 0){
    chips.push(
      `<span class="prize-chip"><span class="p-ico big"></span>` +
      `<span class="p-name">大景品</span><span class="p-mul">×</span><span class="p-cnt">${p.big}</span></span>`
    );
  }
  if(p.mid > 0){
    chips.push(
      `<span class="prize-chip"><span class="p-ico mid"></span>` +
      `<span class="p-name">中景品</span><span class="p-mul">×</span><span class="p-cnt">${p.mid}</span></span>`
    );
  }
  if(p.zandaka > 0){
    chips.push(`<span class="prize-chip zandaka">端数 ${yen(p.zandaka)}</span>`);
  }
  if(chips.length === 0){
    chips.push(`<span class="prize-chip none">—</span>`);
  }
  return chips.join("");
}

function ruleUsesHours(){
  return document.getElementById("rule").value === "R4";
}

// ===== 描画 =====
function render(){
  renderRateUI();
  renderCards();
  renderRuleNote();
  calc();
}

function renderCards(){
  const box = document.getElementById("memberCards");
  box.innerHTML = "";

  if(members.length === 0){
    box.innerHTML = `<div class="empty-members">右上の「+追加」でメンバーを登録してください</div>`;
    return;
  }

  const showHours = ruleUsesHours();

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
          <div class="f"><input inputmode="numeric" data-k="investYen" placeholder="0" value="${groupNum(m.investYen)}">円</div>
        </div>
        <div class="io-box">
          <div class="t">投資（枚）</div>
          <div class="f"><input inputmode="numeric" data-k="investMai" placeholder="0" value="${groupNum(m.investMai)}">枚</div>
        </div>
        <div class="io-box">
          <div class="t">回収（枚）</div>
          <div class="f"><input inputmode="numeric" data-k="retMai" placeholder="0" value="${groupNum(m.retMai)}">枚</div>
        </div>
        <div class="io-box time-box${showHours ? "" : " is-hidden"}">
          <div class="t">稼働時間（開始 → 終了）</div>
          <div class="time-fields">
            <select data-tk="start-h">${hourOptions(splitTime(m.start).h)}</select>
            <span class="time-sep">:</span>
            <select data-tk="start-m">${minuteOptions(splitTime(m.start).m)}</select>
            <span class="time-sep">→</span>
            <select data-tk="end-h">${hourOptions(splitTime(m.end).h)}</select>
            <span class="time-sep">:</span>
            <select data-tk="end-m">${minuteOptions(splitTime(m.end).m)}</select>
          </div>
          <div class="time-result">稼働：<b class="js-hours">${hrs.toFixed(2)}</b> 時間</div>
        </div>
      </div>`;

    card.querySelector(".x-btn").onclick = () => { members.splice(i,1); render(); };

    // 数値入力（投資・回収）
    card.querySelectorAll("input").forEach(inp => {
      const k = inp.dataset.k;
      inp.oninput = () => {
        const v = parseInt(inp.value.replace(/[^0-9]/g,""),10) || 0;
        members[i][k] = v;
        const npl = retOf(members[i]) - investOf(members[i]);
        const plEl = card.querySelector(".member-pl b");
        plEl.textContent = signYen(npl);
        plEl.className = signClass(npl);
        calc();
      };
      inp.onblur = () => {
        inp.value = groupNum(members[i][k]);
      };
      inp.onfocus = () => {
        inp.value = members[i][k] ? String(members[i][k]) : "";
      };
    });

    // 時刻ドロップダウン（開始・終了）
    card.querySelectorAll("select[data-tk]").forEach(sel => {
      sel.onchange = () => {
        const [which, part] = sel.dataset.tk.split("-"); // "start"/"end", "h"/"m"
        const cur = splitTime(members[i][which]);
        let h = part === "h" ? (sel.value === "" ? null : Number(sel.value)) : cur.h;
        let m = part === "m" ? (sel.value === "" ? null : Number(sel.value)) : cur.m;

        if(h === null || m === null){
          members[i][which] = "";   // 時か分どちらか未選択なら未設定扱い
        }else{
          members[i][which] = String(h).padStart(2,"0") + ":" + String(m).padStart(2,"0");
        }
        card.querySelector(".js-hours").textContent = hoursOf(members[i]).toFixed(2);
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

  document.getElementById("summary").innerHTML = `
    <div class="summary-main">総損益</div>
    <div class="summary-pl ${signClass(totalPL)}">${signYen(totalPL)}</div>
    <div class="summary-sub">総投資 <b>${yen(totalInvest)}</b> ／ 総回収 <b>${yen(totalRet)}</b></div>`;

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
      <td data-label="メンバー">${escapeHtml(r.name)}</td>
      <td data-label="個人損益" class="${signClass(r.personalPL)}">${signYen(r.personalPL)}</td>
      <td data-label="清算後の取り分" class="${signClass(r.share)}">${signYen(r.share)}</td>
      <td data-label="精算" class="${signClass(r.settle)}">${signYen(r.settle)}<span class="settle-tag">（${settleLabel(r.settle)}）</span></td>`;
    body.appendChild(tr);
  });

  const transfers = buildTransfers(rows);
  renderSettlement(transfers);
  renderWithdraw(rows, transfers);
  saveState();
}

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

function renderWithdraw(rows, transfers){
  const box = document.getElementById("prizeWithdraw");
  document.getElementById("prizeInfo").textContent =
    `精算で他の人へ渡す金額を、各メンバーがまとめて引き出す個数です（大景品 ${yen(PRIZE_BIG)} / 中景品 ${yen(PRIZE_MID)}）。支払う総額を目安に、貯メダルに残すか景品交換するか判断できます。`;

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
        <div class="wname">${escapeHtml(r.name)}</div>
        <div class="wpay">支払う総額 <b>${yen(info.total)}</b></div>
        <div class="prize-detail">${prizeChips(p)}</div>
        <div class="wnote">渡す先：${info.to.map(escapeHtml).join(" / ")}</div>
      </div>`;
  });

  box.innerHTML = lines.join("") || `<div class="empty">—</div>`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== 保存・復元 =====
const STORAGE_KEY = "noriuchi_calc_v1";

function saveState(){
  try{
    const data = {
      members,
      rate,
      rateMode,
      rule: document.getElementById("rule").value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }catch(e){ /* 保存失敗時は無視（プライベートモード等） */ }
}

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(!raw) return false;
    const data = JSON.parse(raw);
    if(Array.isArray(data.members)) members = data.members;
    if(typeof data.rate === "number") rate = data.rate;
    if(data.rateMode === "yen" || data.rateMode === "mai") rateMode = data.rateMode;
    if(data.rule) document.getElementById("rule").value = data.rule;
    return true;
  }catch(e){ return false; }
}

function calcAndCards(){
  renderCards();
  calc();
}

// ===== イベント =====
document.getElementById("addBtn").onclick = addMember;
document.getElementById("newName").addEventListener("keydown", e => { if(e.key==="Enter") addMember(); });
document.getElementById("rule").onchange = render;

document.getElementById("rate").oninput = (e) => {
  rate = parseFloat(e.target.value.replace(/[^0-9.]/g,"")) || 0;
  if(rate > 0){
    document.getElementById("rateExch").value = Math.round(EXCH_BASE / rate);
  }
  document.getElementById("rateNote").textContent = `現在の単価：${rate.toFixed(2)}円/枚 で円換算して計算します。`;
  calcAndCards();
};

document.getElementById("rateExch").oninput = (e) => {
  const exch = parseInt(e.target.value.replace(/[^0-9]/g,""),10) || 0;
  rate = exch > 0 ? EXCH_BASE / exch : 0;
  document.getElementById("rate").value = rate.toFixed(2);
  document.getElementById("rateNote").textContent =
    `${exch}枚交換 → 単価：${rate.toFixed(2)}円/枚（${EXCH_BASE}円あたり）で計算します。`;
  calcAndCards();
};

document.getElementById("rateMode").onchange = (e) => {
  rateMode = e.target.checked ? "mai" : "yen";
  renderRateUI();
};

function addMember(){
  const inp = document.getElementById("newName");
  const name = inp.value.trim() || String.fromCharCode(65 + members.length);
  members.push({ name, investYen:0, investMai:0, retMai:0, start:DEFAULT_START, end:nowHHMM() });
  inp.value = "";
  render();
}

// 保存データがあれば復元、なければデフォルト初期化
const restored = loadState();

if(restored){
  // 交換率の入力欄に復元値を反映
  document.getElementById("rate").value = rate.toFixed(2);
  if(rate > 0) document.getElementById("rateExch").value = Math.round(EXCH_BASE / rate);
}else{
  members.forEach(m => { if(!m.end) m.end = nowHHMM(); });
  rate = EXCH_BASE / 51;
  document.getElementById("rate").value = rate.toFixed(2);
}

render();