// ===== 状態 =====
let members = [
  { name: "A", investYen: 0, investMai: 0, retMai: 0 },
  { name: "B", investYen: 0, investMai: 0, retMai: 0 },
];
let rate = 19.61;        // 円/枚（実際の計算に使う単価）
let rateMode = "yen";    // "yen" = 円単価入力 / "mai" = ○枚交換入力
const EXCH_BASE = 1000;  // ○枚交換の基準金額（円）

const yen = n => Math.round(n).toLocaleString("ja-JP") + "円";
const signClass = n => n > 0 ? "plus" : (n < 0 ? "minus" : "");
const signYen = n => (n > 0 ? "+" : "") + yen(n);

function investOf(m){ return (m.investYen||0) + (m.investMai||0) * rate; }
function retOf(m){ return (m.retMai||0) * rate; }


// ===== 描画 =====
function render(){
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
      <div class="io-grid invest">
        <div class="io-box">
          <div class="t">投資（円）</div>
          <div class="f"><input inputmode="numeric" data-k="investYen" value="${m.investYen||0}">円</div>
        </div>
        <div class="io-box">
          <div class="t">投資（枚）</div>
          <div class="f"><input inputmode="numeric" data-k="investMai" value="${m.investMai||0}">枚</div>
        </div>
      </div>
      <div class="io-grid" style="margin-top:10px;">
        <div class="io-box io-full">
          <div class="t">回収（枚）</div>
          <div class="f"><input inputmode="numeric" data-k="retMai" value="${m.retMai||0}">枚</div>
        </div>
      </div>`;
    card.querySelector(".x-btn").onclick = () => { members.splice(i,1); render(); };
    card.querySelectorAll("input").forEach(inp => {
      inp.oninput = () => {
        const v = parseInt(inp.value.replace(/[^0-9]/g,""),10) || 0;
        members[i][inp.dataset.k] = v;
        const npl = retOf(members[i]) - investOf(members[i]);
        const plEl = card.querySelector(".member-pl b");
        plEl.textContent = signYen(npl);
        plEl.className = signClass(npl);
        calc();
      };
    });
    box.appendChild(card);
  });
}

function renderRuleNote(){
  const rule = document.getElementById("rule").value;
  const note = document.getElementById("ruleNote");
  if(rule === "R1"){
    note.textContent = "総回収を人数で均等に分けます。投資はそれぞれの自己負担のままです。";
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

  document.getElementById("summary").innerHTML =
    `総投資：<b>${yen(totalInvest)}</b><br>総回収：<b>${yen(totalRet)}</b><br>総損益：<b class="${signClass(totalPL)}">${signYen(totalPL)}</b>`;

  const formula = document.getElementById("formula");
  const body = document.getElementById("resultBody");
  body.innerHTML = "";

  if(n === 0){
    body.innerHTML = `<tr><td colspan="4" class="empty">メンバーを追加してください</td></tr>`;
    document.getElementById("settle").innerHTML = `<div class="empty">—</div>`;
    formula.textContent = "";
    return;
  }

  const rows = members.map(m => {
    const personalPL = retOf(m) - investOf(m);
    let share;
    if(rule === "R1"){
      share = totalRet / n - investOf(m);
    }else{
      share = totalPL / n;
    }
    const settle = share - personalPL;
    return { name:m.name, personalPL, share, settle };
  });

  if(rule === "R1"){
    formula.textContent = `式：各人の取り分(損益) = 総回収(${yen(totalRet)}) ÷ 人数(${n}) − 自分の投資`;
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

  renderSettlement(rows);
}

// ===== 精算指示（最小回数の送金マッチング）=====
function renderSettlement(rows){
  const box = document.getElementById("settle");
  let creditors = rows.filter(r=>r.settle > 0.5).map(r=>({name:r.name, amt:r.settle}));
  let debtors   = rows.filter(r=>r.settle < -0.5).map(r=>({name:r.name, amt:-r.settle}));

  if(creditors.length === 0 && debtors.length === 0){
    box.innerHTML = `<div class="empty">精算は不要です（全員ちょうど）</div>`;
    return;
  }

  const lines = [];
  let ci = 0, di = 0;
  creditors.sort((a,b)=>b.amt-a.amt);
  debtors.sort((a,b)=>b.amt-a.amt);
  while(ci < creditors.length && di < debtors.length){
    const c = creditors[ci], d = debtors[di];
    const pay = Math.min(c.amt, d.amt);
    lines.push(`<div class="settle-line">${escapeHtml(d.name)} → ${escapeHtml(c.name)} に <b>${yen(pay)}</b> 支払う</div>`);
    c.amt -= pay; d.amt -= pay;
    if(c.amt <= 0.5) ci++;
    if(d.amt <= 0.5) di++;
  }
  box.innerHTML = lines.join("") || `<div class="empty">精算は不要です</div>`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== イベント =====
document.getElementById("addBtn").onclick = addMember;
document.getElementById("newName").addEventListener("keydown", e => { if(e.key==="Enter") addMember(); });
document.getElementById("rule").onchange = render;
document.getElementById("rate").oninput = (e) => {
  rate = parseInt(e.target.value.replace(/[^0-9]/g,""),10) || 0;
  render();
};

function addMember(){
  const inp = document.getElementById("newName");
  const name = inp.value.trim() || String.fromCharCode(65 + members.length);
  members.push({ name, investYen:0, investMai:0, retMai:0 });
  inp.value = "";
  render();
}

render();
