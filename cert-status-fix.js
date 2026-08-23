/* ============================================================
   박진우원예치료센터 · 자격증 조회 상태 안내 (certificate.html 보완)
   ------------------------------------------------------------
   기존 페이지의 조회 기능을 덮어써서
     1) 로그인 없이도 조회가 되도록 하고
     2) 발급 상태(정상 / 정지예정 / 정지 / 만료)에 따라
        각각 다른 안내문이 나오도록 합니다.

   자료는 bjw_certs 컬렉션을 읽습니다. (공개 읽기 / 쓰기는 관리자만)
   상태 관리는 통합 업무 허브 → 자격증 상태 관리 에서 합니다.
   ============================================================ */
import { initializeApp, getApps, getApp }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore, collection, query, where, getDocs, limit }
  from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyA40OooHSHAyCc-kwps50pDJ504f92hxfo",
  authDomain: "pjw-cert.firebaseapp.com",
  projectId: "pjw-cert",
  storageBucket: "pjw-cert.firebasestorage.app",
  messagingSenderId: "819294382402",
  appId: "1:819294382402:web:1dd27376446616af09c0db"
};
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const db  = getFirestore(app);

/* ---------- 유틸 ---------- */
const esc = s => String(s ?? "").replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const pad = n => String(n).padStart(2, '0');
const todayISO = () => { const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; };

/* 2026-09-30 → 2026년 9월 30일 */
function korDate(v){
  if(!v) return '';
  const s = String(v).slice(0,10).replace(/[./]/g,'-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  return m ? `${m[1]}년 ${Number(m[2])}월 ${Number(m[3])}일` : s;
}
const ymd = v => v ? String(v).slice(0,10).replace(/-/g,'.') : '—';

/* 홍길동 → 홍*동 · 김철 → 김* */
function maskName(name){
  const n = String(name || '').trim();
  if(n.length <= 1) return n;
  if(n.length === 2) return n[0] + '*';
  return n[0] + '*'.repeat(n.length - 2) + n[n.length - 1];
}

/* 유효기간이 지났으면 '만료'로 본다 */
function effectiveStatus(c){
  const s = (c.certStatus || '정상').trim();
  if(s === '정상' && c.validDate && String(c.validDate).slice(0,10) < todayISO()) return '만료';
  return s;
}

/* ---------- 상태별 안내문 ---------- */
function statusBlock(c){
  const st     = effectiveStatus(c);
  const label  = esc(c.certLabel || '자격증');
  const holder = esc(maskName(c.name));
  const reason = c.statusReason ? `사유: <strong>${esc(c.statusReason)}</strong><br>` : '';
  const note   = c.statusNote ? `<div style="margin-top:8px">${esc(c.statusNote)}</div>` : '';

  const info = `
    <div style="margin-top:10px;font-size:12.5px;line-height:1.9">
      자격증명: <strong>${label}</strong><br>
      소지인: <strong>${holder}</strong>님<br>
      자격번호: <strong>${esc(c.certNo || '—')}</strong><br>
      발급일: ${ymd(c.issuedDate)} · 유효기간: ~${ymd(c.validDate)}
    </div>`;

  if(st === '정지예정'){
    const from = c.statusFrom
      ? `<strong>${esc(korDate(c.statusFrom))}</strong>부터 자격이 정지될 예정입니다.`
      : `자격정지가 예정되어 있습니다.`;
    return `<div class="alert alert-warning" style="display:block">
      ⚠️ <strong>자격정지 예정</strong><br>
      ${from}<br>${reason}
      기한 내에 필요한 조치(보수교육 이수 등)를 완료하시면 정지되지 않습니다.
      ${note}${info}
    </div>`;
  }

  if(st === '정지'){
    const from = c.statusFrom ? `정지일: <strong>${esc(korDate(c.statusFrom))}</strong><br>` : '';
    return `<div class="alert alert-danger" style="display:block">
      ⛔ <strong>현재 자격정지 상태입니다.</strong><br>
      정지 기간 중에는 해당 자격을 사용하실 수 없습니다.<br>
      ${from}${reason}
      정지 해제 절차는 센터로 문의해 주세요.
      ${note}${info}
    </div>`;
  }

  if(st === '만료'){
    return `<div class="alert alert-warning" style="display:block">
      🕓 <strong>유효기간이 만료된 자격증입니다.</strong><br>
      만료일: <strong>${ymd(c.validDate)}</strong><br>
      보수교육 이수 후 갱신·재발급을 받으셔야 자격이 다시 유효해집니다.
      ${note}${info}
    </div>`;
  }

  /* 정상 */
  return `<div class="alert alert-success" style="display:block">
    ✅ <strong>유효한 자격증입니다.</strong>
    ${note}${info}
  </div>`;
}

/* ---------- 자격증 번호로 진위 확인 ---------- */
window.verifyCertNo = async function(){
  const input  = document.getElementById('cert-no-verify');
  const box    = document.getElementById('verify-results');
  if(!box) return;

  const certNo = (input?.value || '').trim();
  if(!certNo){
    box.innerHTML = `<div class="alert alert-warning" style="display:block">
      자격증 번호를 입력해 주세요.</div>`;
    return;
  }

  box.innerHTML = `<div class="spinner"></div>`;

  try{
    const snap = await getDocs(
      query(collection(db, 'bjw_certs'), where('certNo', '==', certNo), limit(1)));

    if(snap.empty){
      box.innerHTML = `<div class="alert alert-danger" style="display:block">
        ❌ <strong>${esc(certNo)}</strong> 는 등록되지 않은 자격증 번호입니다.<br>
        번호를 다시 확인하시거나 센터로 문의해 주세요.</div>`;
      return;
    }
    box.innerHTML = statusBlock(snap.docs[0].data());

  }catch(e){
    console.error('[cert-verify]', e);
    box.innerHTML = `<div class="alert alert-danger" style="display:block">
      조회 중 문제가 발생했습니다. (${esc(e.code || e.message)})<br>
      잠시 후 다시 시도하시거나 센터로 문의해 주세요.</div>`;
  }
};

/* ---------- 성명 + 생년월일 조회 ----------
   생년월일은 개인정보라 공개 자료함에 두지 않습니다.
   따라서 이 조회는 자격증 번호 조회로 안내합니다. */
window.lookupCerts = async function(){
  const box = document.getElementById('lookup-results');
  const loading = document.getElementById('lookup-loading');
  if(loading) loading.style.display = 'none';
  if(!box) return;
  box.innerHTML = `<div class="alert alert-info" style="display:block">
    🔒 개인정보 보호를 위해 성명·생년월일 조회는 제공하지 않습니다.<br>
    아래 <strong>자격증 번호</strong> 칸에 번호를 입력해 확인해 주세요.
    번호를 모르시는 경우 센터로 문의해 주시면 확인해 드립니다.</div>`;
};

console.log('[cert-status-fix] 자격증 상태 안내 적용됨');
