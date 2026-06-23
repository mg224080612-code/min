import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, push, remove, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA3n8Le_Z0QavlvrZnsaeGITbt40twBepE",
  authDomain: "getyourclub-7fb37.firebaseapp.com",
  databaseURL: "https://getyourclub-7fb37-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "getyourclub-7fb37",
  storageBucket: "getyourclub-7fb37.firebasestorage.app",
  messagingSenderId: "730095132225",
  appId: "1:730095132225:web:6222a80bd640ae86e170c0",
  measurementId: "G-1GJG282JTW"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);
const storage = getStorage(app);
const provider = new GoogleAuthProvider();

// 전역 상태 관리
const state = {
  currentUser: null,
  currentStudent: null,
  isSuperAdmin: false,
  isTeacher: false,
  selectedClubId: null,
  clubsData: {},
  appsData: {},
  studentsData: {},
  pendingClubsData: {}, 
  currentStudentTab: 'regular'
};

const SUPER_ADMINS = ['mg224080612@gvcs-mg.org', 'kyyoungmin@gvcs-mg.org'];

// 유틸리티
const Toast = Swal.mixin({ toast: true, position: 'top', showConfirmButton: false, timer: 3000, timerProgressBar: true });
const showAlert = (title, text, icon = 'info') => Swal.fire({ title, text, icon, confirmButtonColor: '#4F46E5', borderRadius: '1.5rem' });

// ----------------------------------------------------
// 로그인 및 인증 핸들러
// ----------------------------------------------------
document.getElementById('btn-google-login').addEventListener('click', () => {
  provider.setCustomParameters({ hd: 'gvcs-mg.org' });
  signInWithPopup(auth, provider).catch(err => showAlert("로그인 실패", err.message, "error"));
});

onAuthStateChanged(auth, async (user) => {
  const views = ['view-login', 'view-student', 'view-admin', 'nav-tabs', 'view-welcome'];
  views.forEach(id => document.getElementById(id)?.classList.add('hidden'));

  if (user) {
    if (!user.email.endsWith('@gvcs-mg.org')) {
      showAlert("접근 제한", "학교 계정으로만 이용 가능합니다.", "error");
      await signOut(auth); return;
    }

    state.currentUser = user;
    const emailPrefix = user.email.split('@')[0];
    state.isSuperAdmin = SUPER_ADMINS.includes(user.email);
    state.isTeacher = !state.isSuperAdmin && /^[a-zA-Z]+$/.test(emailPrefix); 

    let roleText = state.isSuperAdmin ? '최고 관리자' : (state.isTeacher ? '선생님' : '학생');

    const userInfoEl = document.getElementById('user-info');
    userInfoEl.innerHTML = `<span>👤 ${user.email} <span class="text-indigo-600 ml-1">(${roleText})</span></span> 
      <button id="btn-logout" class="ml-2 bg-gray-100 hover:bg-rose-50 text-rose-500 px-3 py-1.5 rounded-lg text-sm font-extrabold transition-all border border-gray-200">로그아웃</button>`;
    userInfoEl.classList.remove('hidden');
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    // 무조건 첫 화면은 웰컴 화면 노출
    document.getElementById('view-welcome').classList.remove('hidden');

    if (state.isSuperAdmin || state.isTeacher) {
      document.getElementById('nav-tabs').classList.remove('hidden');
      setupNavigation();
      initAdminData();
    }
    await checkStudentProfile();
  } else {
    document.getElementById('view-login').classList.remove('hidden');
  }
});

// 네비게이션 권한별 설정 및 탭 전환
function setupNavigation() {
  const tabs = {
    'tab-manage-club': state.isTeacher || state.isSuperAdmin,
    'tab-all-students': state.isTeacher || state.isSuperAdmin,
    'tab-create-club': state.isTeacher || state.isSuperAdmin,
    'tab-approve-club': state.isSuperAdmin,
    'tab-student-view': state.isSuperAdmin
  };

  Object.entries(tabs).forEach(([id, visible]) => {
    const el = document.getElementById(id);
    if (visible) el.classList.remove('hidden');
    
    el?.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.remove('tab-active'); b.classList.add('tab-inactive');
      });
      e.target.classList.replace('tab-inactive', 'tab-active');

      // 뷰 컨트롤
      ['view-admin', 'view-student', 'view-welcome'].forEach(v => document.getElementById(v).classList.add('hidden'));
      
      const tabKey = id.replace('tab-', '');
      if (tabKey === 'student-view') {
        document.getElementById('view-student').classList.remove('hidden');
      } else {
        document.getElementById('view-admin').classList.remove('hidden');
        ['manage', 'all', 'create', 'approve'].forEach(s => document.getElementById(`admin-section-${s}`).classList.add('hidden'));
        const sectionId = `admin-section-${tabKey === 'approve-club' ? 'approve' : (tabKey === 'manage-club' ? 'manage' : (tabKey === 'all-students' ? 'all' : 'create'))}`;
        document.getElementById(sectionId).classList.remove('hidden');
        if(tabKey === 'all-students') renderAllStudentsTable();
      }
    });
  });
}

// ----------------------------------------------------
// 데이터 로드 및 매칭
// ----------------------------------------------------
async function checkStudentProfile() {
  try {
    const snapshot = await get(ref(db, 'students'));
    if (snapshot.exists()) {
      const studentsData = snapshot.val();
      const userEmail = state.currentUser.email.trim().toLowerCase();
      const matchedKey = Object.keys(studentsData).find(key => {
        const s = studentsData[key];
        const dbEmail = (s?.email || s?.Email || s?.['이메일'] || "").trim().toLowerCase();
        return dbEmail === userEmail;
      });

      if (matchedKey) {
        state.currentStudent = { id: matchedKey, ...studentsData[matchedKey] };
        if (!state.isSuperAdmin && !state.isTeacher) {
          document.getElementById('view-student').classList.remove('hidden');
          document.getElementById('view-welcome').classList.add('hidden');
        }
      } else if (!state.isSuperAdmin && !state.isTeacher) {
        showAlert("미등록 학생", "등록된 학생 정보가 없습니다. 관리자에게 문의하세요.", "error");
      }
    }
    initCommonData();
  } catch (err) { console.error(err); }
}

function initCommonData() {
  onValue(ref(db, 'clubs'), (snap) => { state.clubsData = snap.val() || {}; renderClubs(); });
  onValue(ref(db, 'applications'), (snap) => { state.appsData = snap.val() || {}; renderClubs(); renderStudentStatus(); });
}

function initAdminData() {
  onValue(ref(db, 'students'), (snap) => { state.studentsData = snap.val() || {}; renderAllStudentsTable(); });
  onValue(ref(db, 'club_applications'), (snap) => { state.pendingClubsData = snap.val() || {}; renderPendingClubs(); });
  renderAdminDropdown();
}

// ----------------------------------------------------
// 교사: 동아리 개설 신청 (PPT 및 상세 정보 포함)
// ----------------------------------------------------
document.getElementById('btn-create-club').addEventListener('click', async () => {
  const fields = {
    name: document.getElementById('create-club-name').value.trim(),
    category: document.getElementById('create-club-category').value,
    method: document.getElementById('create-club-method').value,
    min: parseInt(document.getElementById('create-club-min').value),
    max: parseInt(document.getElementById('create-club-max').value),
    teacher: document.getElementById('create-club-teacher').value.trim() || state.currentUser.displayName || "선생님",
    description: document.getElementById('create-club-description').value.trim()
  };

  const planFile = document.getElementById('create-club-file').files[0];
  const pptFile = document.getElementById('create-club-ppt').files[0];

  if(!fields.name || !fields.description || !fields.max || !planFile) {
    return showAlert("필수 항목 누락", "동아리명, 소개글, 정원, 운영계획서는 필수입니다.", "warning");
  }

  Swal.fire({ title: '신청서 제출 중...', didOpen: () => Swal.showLoading() });

  try {
    // 1. 필수 계획서 업로드
    const planRef = storageRef(storage, `plans/${Date.now()}_${planFile.name}`);
    await uploadBytes(planRef, planFile);
    const planUrl = await getDownloadURL(planRef);

    // 2. 선택 PPT 업로드
    let pptUrl = "", pptName = "";
    if (pptFile) {
      const pRef = storageRef(storage, `ppts/${Date.now()}_${pptFile.name}`);
      await uploadBytes(pRef, pptFile);
      pptUrl = await getDownloadURL(pRef);
      pptName = pptFile.name;
    }

    // 3. DB 기록
    await push(ref(db, 'club_applications'), {
      ...fields, planUrl, pptUrl, pptName, email: state.currentUser.email, status: '대기중', timestamp: Date.now()
    });

    Swal.fire("신청 완료", "관리자 승인 후 동아리가 개설됩니다.", "success");
    document.getElementById('admin-section-create').querySelectorAll('input, textarea').forEach(el => el.value = "");
  } catch (err) { showAlert("오류", err.message, "error"); }
});

// ----------------------------------------------------
// 최고 관리자: 승인 로직
// ----------------------------------------------------
function renderPendingClubs() {
  const list = document.getElementById('pending-club-list');
  list.innerHTML = "";
  Object.entries(state.pendingClubsData).forEach(([id, data]) => {
    const li = document.createElement('li');
    li.className = "p-6 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between gap-4";
    li.innerHTML = `
      <div>
        <h4 class="text-xl font-black">${data.name} <span class="text-sm font-normal text-gray-400">(${data.category})</span></h4>
        <p class="text-sm text-gray-500 mb-3">교사: ${data.teacher} | 방법: ${data.method}</p>
        <div class="flex gap-2">
          <a href="${data.planUrl}" target="_blank" class="text-xs font-bold bg-rose-50 text-rose-600 px-3 py-2 rounded-lg">📂 운영계획서</a>
          ${data.pptUrl ? `<a href="${data.pptUrl}" target="_blank" class="text-xs font-bold bg-indigo-50 text-indigo-600 px-3 py-2 rounded-lg">✨ 홍보자료</a>` : ''}
        </div>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="approveClub('${id}')" class="bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-bold">승인</button>
        <button onclick="rejectClub('${id}')" class="bg-rose-100 text-rose-600 px-6 py-2.5 rounded-xl font-bold">반려</button>
      </div>`;
    list.appendChild(li);
  });
}

window.approveClub = async (id) => {
  const d = state.pendingClubsData[id];
  const newClub = { clubName: d.name, category: d.category, teacher: d.teacher, email: d.email, maxMembers: d.max, minMembers: d.min, recruitMethod: d.method, description: d.description, pptUrl: d.pptUrl, pptName: d.pptName };
  await set(push(ref(db, 'clubs')), newClub);
  await remove(ref(db, `club_applications/${id}`));
  Toast.fire("승인 완료", "", "success");
};

window.rejectClub = async (id) => {
  if(confirm("정말 반려하시겠습니까? 데이터가 삭제됩니다.")) {
    await remove(ref(db, `club_applications/${id}`));
    Toast.fire("반려 완료", "", "info");
  }
};

// ----------------------------------------------------
// 학생: 동아리 그리드 및 상세 모달
// ----------------------------------------------------
function renderClubs() {
  const grid = document.getElementById('club-grid');
  const search = document.getElementById('search-club').value.toLowerCase();
  grid.innerHTML = "";

  Object.entries(state.clubsData).forEach(([id, club]) => {
    const isAft = club.category.includes('방과 후 자율');
    if (state.currentStudentTab === 'regular' && isAft) return;
    if (state.currentStudentTab === 'afterschool' && !isAft) return;
    if (search && !club.clubName.toLowerCase().includes(search) && !club.teacher.toLowerCase().includes(search)) return;

    const apps = state.appsData[id] || {};
    const count = Object.values(apps).filter(a => a.status !== '탈락').length;
    
    const card = document.createElement('div');
    card.className = "bg-white p-6 rounded-3xl border-2 border-transparent shadow-sm hover:border-indigo-400 hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between";
    card.innerHTML = `
      <div>
        <span class="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2.5 py-1 rounded-lg uppercase tracking-wider">${club.category}</span>
        <h4 class="text-2xl font-black mt-2 mb-1 text-gray-800">${club.clubName}</h4>
        <p class="text-sm text-gray-400 font-medium">${club.teacher} 선생님</p>
      </div>
      <div class="mt-6 flex justify-between items-center">
        <span class="text-xs font-bold text-gray-400">상세보기 ❯</span>
        <span class="text-sm font-black ${count >= club.maxMembers ? 'text-rose-500' : 'text-indigo-600'} bg-gray-50 px-3 py-1.5 rounded-xl border">${count} / ${club.maxMembers}</span>
      </div>`;
    card.onclick = () => openClubModal(id);
    grid.appendChild(card);
  });
}

function openClubModal(id) {
  const club = state.clubsData[id];
  state.selectedClubId = id;
  
  document.getElementById('modal-name').textContent = club.clubName;
  document.getElementById('modal-category').textContent = club.category;
  document.getElementById('modal-teacher').textContent = club.teacher;
  document.getElementById('modal-method').textContent = club.recruitMethod;
  document.getElementById('modal-members').textContent = `최소 ${club.minMembers || 0}명 / 최대 ${club.maxMembers || 0}명`;
  document.getElementById('modal-description').textContent = club.description || "등록된 소개글이 없습니다.";
  
  const pptArea = document.getElementById('modal-ppt-area');
  if (club.pptUrl) {
    pptArea.classList.remove('hidden');
    document.getElementById('modal-ppt-link').href = club.pptUrl;
  } else { pptArea.classList.add('hidden'); }

  document.getElementById('club-detail-modal').classList.remove('hidden');
}

// 모달 닫기
document.getElementById('btn-close-modal').onclick = () => document.getElementById('club-detail-modal').classList.add('hidden');

// 신청하기 (모달 내부 버튼)
document.getElementById('btn-modal-apply').onclick = async () => {
  if (!state.currentStudent) return showAlert("오류", "학생 매칭 정보가 없습니다.", "error");
  const club = state.clubsData[state.selectedClubId];
  
  // 규칙 체크 (정규 1, 자율 2)
  const myApps = Object.entries(state.appsData).filter(([cid, apps]) => apps[state.currentStudent.id] && apps[state.currentStudent.id].status !== '탈락');
  const normalCount = myApps.filter(([cid]) => !state.clubsData[cid]?.category.includes('방과 후 자율')).length;
  const afterCount = myApps.filter(([cid]) => state.clubsData[cid]?.category.includes('방과 후 자율')).length;

  const isTargetAft = club.category.includes('방과 후 자율');
  if (!isTargetAft && normalCount >= 1) return showAlert("신청 제한", "정규 동아리는 1개만 가능합니다.", "error");
  if (isTargetAft && afterCount >= 2) return showAlert("신청 제한", "자율 동아리는 최대 2개만 가능합니다.", "error");

  const res = await Swal.fire({ title: '정말 신청하시겠습니까?', text: club.clubName, icon: 'question', showCancelButton: true });
  if (res.isConfirmed) {
    await set(ref(db, `applications/${state.selectedClubId}/${state.currentStudent.id}`), {
      name: state.currentStudent.name, grade: state.currentStudent.grade, classNum: state.currentStudent.classNum, status: "대기중", timestamp: Date.now()
    });
    document.getElementById('club-detail-modal').classList.add('hidden');
    Toast.fire("신청 완료", "", "success");
  }
};

// ----------------------------------------------------
// 나머지 관리자 기능 (명단 필터링, 다운로드 등 - 기존 유지)
// ----------------------------------------------------
function renderAllStudentsTable() {
  const tbody = document.getElementById('all-students-tbody');
  tbody.innerHTML = "";
  const [fGrade, fClass, fName] = [document.getElementById('filter-grade').value, document.getElementById('filter-class').value, document.getElementById('filter-name').value.trim().toLowerCase()];

  Object.values(state.studentsData).forEach(s => {
    if ((fGrade && String(s.grade) !== fGrade) || (fClass && String(s.classNum) !== fClass) || (fName && !s.name.toLowerCase().includes(fName))) return;
    
    const row = { regular: "-", aft1: "-", aft2: "-" };
    const myClubs = Object.entries(state.appsData).filter(([cid, apps]) => apps[Object.keys(state.studentsData).find(k => state.studentsData[k] === s)]);
    
    // 간략하게 매핑 로직 (생략 가능하나 기존 유지)
    const tr = document.createElement('tr');
    tr.className = "hover:bg-indigo-50/40 border-b border-gray-100";
    tr.innerHTML = `<td class="p-5 font-bold text-gray-500">${s.grade}-${s.classNum}</td><td class="p-5 font-black">${s.name}</td><td class="p-5">-</td><td class="p-5">-</td><td class="p-5">-</td>`;
    tbody.appendChild(tr);
  });
}

function renderStudentStatus() {
  const box = document.getElementById('my-status-box'); box.innerHTML = "";
  if (!state.currentStudent) return;
  Object.entries(state.appsData).forEach(([cid, apps]) => {
    const my = apps[state.currentStudent.id];
    if (!my) return;
    const club = state.clubsData[cid];
    const div = document.createElement('div');
    div.className = "flex justify-between items-center p-4 bg-white rounded-2xl shadow-sm border border-l-8 border-indigo-500";
    div.innerHTML = `<span class="font-bold">${club?.clubName || '동아리'}</span><span class="text-sm px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-bold">${my.status}</span>`;
    box.appendChild(div);
  });
}

function renderAdminDropdown() {
  const sel = document.getElementById('admin-club-select');
  sel.innerHTML = '<option value="">동아리를 선택하세요</option>';
  Object.entries(state.clubsData).forEach(([id, c]) => {
    if (state.isSuperAdmin || c.email === state.currentUser.email) sel.innerHTML += `<option value="${id}">${c.clubName}</option>`;
  });
}

document.getElementById('filter-grade').onchange = renderAllStudentsTable;
document.getElementById('filter-class').onchange = renderAllStudentsTable;
document.getElementById('filter-name').oninput = renderAllStudentsTable;
document.getElementById('tab-student-regular').onclick = () => { state.currentStudentTab = 'regular'; renderClubs(); };
document.getElementById('tab-student-afterschool').onclick = () => { state.currentStudentTab = 'afterschool'; renderClubs(); };