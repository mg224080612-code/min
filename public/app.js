import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, get, set, update, onValue, push, remove, query, orderByChild, equalTo } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-storage.js";

// Supabase 설정
const supabaseUrl = 'https://dzmsclhojumetrktazmb.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR6bXNjbGhvanVtZXRya3Rhem1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyNTY4NTEsImV4cCI6MjA5NzgzMjg1MX0.Wbcs_t8p9Umzy2U4DAv1IpM5HxPqQZAFEgsq97xsM18';
const supabase = window.supabase.createClient(supabaseUrl, supabaseKey);

// Firebase 설정
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

// 전역 상태
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

const SUPER_ADMINS = ['mg224080612@gvcs-mg.org', 'kyoungmin@gvcs-mg.org'];

const Toast = Swal.mixin({ toast: true, position: 'top', showConfirmButton: false, timer: 3000, timerProgressBar: true });
// 🚨 수정됨: borderRadius 경고 제거
const showAlert = (title, text, icon = 'info') => Swal.fire({ title, text, icon, confirmButtonColor: '#4F46E5' });

// UI 이벤트 리스너 안전하게 바인딩
const editPptInput = document.getElementById('edit-club-ppt');
if (editPptInput) {
  editPptInput.addEventListener('change', function() {
    const nameDisplay = document.getElementById('current-ppt-name');
    if (nameDisplay) nameDisplay.textContent = this.files[0] ? `[새 파일 첨부됨] ${this.files[0].name}` : '현재 등록된 파일 없음';
  });
}

// 로그인 및 상태 감지
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

      ['view-admin', 'view-student', 'view-welcome'].forEach(v => document.getElementById(v).classList.add('hidden'));
      
      const tabKey = id.replace('tab-', '');
      if (tabKey === 'student-view') {
        document.getElementById('view-student').classList.remove('hidden');
      } else {
        document.getElementById('view-admin').classList.remove('hidden');
        ['manage', 'all', 'create', 'approve'].forEach(s => document.getElementById(`admin-section-${s}`).classList.add('hidden'));
        document.getElementById(`admin-section-${tabKey === 'approve-club' ? 'approve' : (tabKey === 'manage-club' ? 'manage' : (tabKey === 'all-students' ? 'all' : 'create'))}`).classList.remove('hidden');
        if(tabKey === 'all-students') renderAllStudentsTable();
      }
    });
  });
}

async function checkStudentProfile() {
  try {
    const snapshot = await get(ref(db, 'students'));
    if (snapshot.exists()) {
      const studentsData = snapshot.val();
      const userEmail = state.currentUser.email.trim().toLowerCase();
      const matchedKey = Object.keys(studentsData).find(key => {
        const s = studentsData[key];
        return (s?.email || s?.Email || s?.['이메일'] || "").trim().toLowerCase() === userEmail;
      });

      if (matchedKey) {
        state.currentStudent = { id: matchedKey, ...studentsData[matchedKey] };
      } else if (!state.isSuperAdmin && !state.isTeacher) {
        showAlert("미등록 학생", "등록된 학생 정보가 없습니다. 관리자에게 문의하세요.", "error");
      }
    }
    initCommonData();
  } catch (err) { console.error(err); }
}

function initCommonData() {
  onValue(ref(db, 'clubs'), (snap) => { state.clubsData = snap.val() || {}; renderClubs(); if(state.isTeacher || state.isSuperAdmin) renderAdminDropdown(); });
  onValue(ref(db, 'applications'), (snap) => { state.appsData = snap.val() || {}; renderClubs(); renderStudentStatus(); if(state.isTeacher || state.isSuperAdmin) renderAdminList(); });
}
function initAdminData() {
  onValue(ref(db, 'students'), (snap) => { state.studentsData = snap.val() || {}; renderAllStudentsTable(); });
  onValue(ref(db, 'club_applications'), (snap) => { state.pendingClubsData = snap.val() || {}; renderPendingClubs(); });
}

// 교사: 동아리 개설 신청
document.getElementById('btn-create-club').addEventListener('click', async () => {
  const nameInput = document.getElementById('create-club-name').value.trim();
  const categoryInput = document.getElementById('create-club-category').value;
  const maxInput = parseInt(document.getElementById('create-club-max').value) || 18;
  const teacherInput = document.getElementById('create-club-teacher').value.trim();
  
  const teacherName = teacherInput || (state.currentUser && state.currentUser.displayName ? state.currentUser.displayName : "담당 교사");
  
  const fileInput = document.getElementById('create-club-file');
  const planFile = fileInput.files.length > 0 ? fileInput.files[0] : null;

  if(!nameInput || !planFile) {
    return showAlert("입력 오류", "동아리명과 운영 계획서 파일은 필수입니다.", "warning");
  }

  Swal.fire({ title: '신청서 제출 중...', didOpen: () => Swal.showLoading() });
  try {
    let planUrl = "";
    
    // 🚨 수정됨: 수파베이스 파일명 오류(한글/띄어쓰기) 완벽 해결
    if (planFile) {
      const fileExtension = planFile.name.split('.').pop();
      const filePath = `plan_${Date.now()}.${fileExtension}`;
      
      const { data, error } = await supabase.storage
        .from('plans')
        .upload(filePath, planFile);

      if (error) {
        console.error("수파베이스 업로드 에러:", error);
        return showAlert("업로드 실패", "파일 업로드 중 문제가 발생했습니다.", "error");
      }

      const { data: publicUrlData } = supabase.storage
        .from('plans')
        .getPublicUrl(filePath);
      planUrl = publicUrlData.publicUrl;
    }

    await push(ref(db, 'club_applications'), {
      name: nameInput, 
      category: categoryInput, 
      max: maxInput, 
      teacher: teacherName, 
      email: state.currentUser ? state.currentUser.email : "", 
      planUrl: planUrl, 
      status: '대기중', 
      timestamp: Date.now()
    });
    
    Swal.fire("신청 접수 완료", "관리자 승인 후 '내 동아리 관리'에서 소개글과 정보를 추가할 수 있습니다.", "success");
    
    document.getElementById('create-club-name').value = ""; 
    document.getElementById('create-club-teacher').value = ""; 
    document.getElementById('create-club-file').value = "";
  } catch (err) { 
    console.error("개설 신청 에러:", err);
    showAlert("오류 발생", "신청 중 문제가 발생했습니다. 새로고침 후 다시 시도해주세요.", "error"); 
  }
});

// 관리자: 개설 승인 로직
function renderPendingClubs() {
  const list = document.getElementById('pending-club-list'); list.innerHTML = "";
  Object.entries(state.pendingClubsData).forEach(([id, data]) => {
    const li = document.createElement('li');
    li.className = "p-6 bg-white rounded-2xl shadow-sm border border-gray-200 flex flex-col md:flex-row justify-between gap-4";
    li.innerHTML = `
      <div><h4 class="text-xl font-black">${data.name}</h4><p class="text-sm text-gray-500">교사: ${data.teacher} / 정원: ${data.max}명</p><a href="${data.planUrl}" target="_blank" class="text-xs font-bold text-indigo-600 underline mt-2 block">📂 운영계획서 확인</a></div>
      <div class="flex items-center gap-2"><button onclick="approveClub('${id}')" class="bg-indigo-600 text-white px-4 py-2 rounded-xl">승인</button><button onclick="rejectClub('${id}')" class="bg-rose-100 text-rose-600 px-4 py-2 rounded-xl">반려</button></div>`;
    list.appendChild(li);
  });
}

window.approveClub = async (id) => {
  const d = state.pendingClubsData[id];
  await set(push(ref(db, 'clubs')), { clubName: d.name, category: d.category, teacher: d.teacher, email: d.email, maxMembers: d.max });
  await remove(ref(db, `club_applications/${id}`)); Toast.fire("승인 완료", "", "success");
};
window.rejectClub = async (id) => {
  if(confirm("반려하시겠습니까?")) { await remove(ref(db, `club_applications/${id}`)); Toast.fire("반려 완료", "", "info"); }
};

function renderAdminDropdown() {
  const sel = document.getElementById('admin-club-select'); const currentVal = sel.value;
  sel.innerHTML = '<option value="">▼ 관리할 동아리를 선택하세요</option>';
  Object.entries(state.clubsData).forEach(([id, c]) => {
    if (state.isSuperAdmin || c.email === state.currentUser.email) sel.innerHTML += `<option value="${id}">${c.clubName}</option>`;
  });
  if(state.clubsData[currentVal]) sel.value = currentVal;
  renderAdminList();
}

document.getElementById('admin-club-select').addEventListener('change', renderAdminList);

function renderAdminList() {
  const clubId = document.getElementById('admin-club-select').value;
  const editSection = document.getElementById('admin-club-edit-section');
  const listEl = document.getElementById('applicant-list');
  
  if(!clubId) {
    editSection.classList.add('hidden');
    listEl.innerHTML = '<li class="p-10 border-2 border-dashed border-gray-200 rounded-2xl text-center text-gray-400 font-medium">동아리를 선택해 주세요.</li>';
    document.getElementById('accepted-count').textContent = '0'; document.getElementById('max-count').textContent = '0';
    return;
  }
  
  const clubInfo = state.clubsData[clubId];
  editSection.classList.remove('hidden');
  
  document.getElementById('edit-club-method').value = clubInfo.recruitMethod || '선착순 자동 합격';
  document.getElementById('edit-club-teacher').value = clubInfo.teacher || '';
  document.getElementById('edit-club-min').value = clubInfo.minMembers || 0;
  document.getElementById('edit-club-max').value = clubInfo.maxMembers || 18;
  document.getElementById('edit-club-description').value = clubInfo.description || '';
  document.getElementById('current-ppt-name').textContent = clubInfo.pptName ? `[등록됨] ${clubInfo.pptName}` : '현재 등록된 파일 없음';
  document.getElementById('edit-club-ppt').value = '';

  document.getElementById('max-count').textContent = clubInfo.maxMembers;
  const applicants = state.appsData[clubId] || {};
  let acceptedCount = Object.values(applicants).filter(a => a.status === '합격').length;
  document.getElementById('accepted-count').textContent = acceptedCount;

  const uids = Object.keys(applicants);
  if (uids.length === 0) {
    listEl.innerHTML = '<li class="p-10 border-2 border-dashed border-gray-200 rounded-2xl text-center text-gray-400 font-medium">아직 신청자가 없습니다.</li>';
    return;
  }
  listEl.innerHTML = '';
  uids.sort((a, b) => (applicants[a].timestamp || 0) - (applicants[b].timestamp || 0)).forEach(studentId => {
    const data = applicants[studentId];
    const li = document.createElement('li');
    li.className = "flex flex-col sm:flex-row justify-between items-center p-6 border border-gray-200 rounded-2xl bg-white shadow-sm gap-4";
    const info = `<div class="flex items-center gap-3"><span class="text-lg text-gray-500 font-medium">${data.grade}-${data.classNum} <span class="font-extrabold text-xl text-gray-900 ml-1">${data.name}</span></span></div>`;
    let buttons = data.status === '대기중' 
      ? `<div class="flex gap-2"><button onclick="changeStatus('${clubId}', '${studentId}', '합격', ${acceptedCount}, ${clubInfo.maxMembers})" class="bg-emerald-500 text-white px-5 py-2 rounded-xl font-bold">합격</button><button onclick="changeStatus('${clubId}', '${studentId}', '탈락', ${acceptedCount}, ${clubInfo.maxMembers})" class="bg-rose-500 text-white px-5 py-2 rounded-xl font-bold">탈락</button></div>`
      : `<div class="flex items-center gap-4"><span class="font-extrabold ${data.status === '합격'?'text-emerald-600 bg-emerald-50':'text-rose-600 bg-rose-50'} px-4 py-1.5 rounded-xl text-lg">${data.status}</span><button onclick="changeStatus('${clubId}', '${studentId}', '대기중', ${acceptedCount}, ${clubInfo.maxMembers})" class="text-sm text-gray-400 hover:text-gray-700 underline">상태 초기화</button></div>`;
    li.innerHTML = `${info} ${buttons}`;
    listEl.appendChild(li);
  });
}

document.getElementById('btn-save-club-info').addEventListener('click', async () => {
  const clubId = document.getElementById('admin-club-select').value;
  if(!clubId) return;

  const updates = {
    recruitMethod: document.getElementById('edit-club-method').value,
    minMembers: parseInt(document.getElementById('edit-club-min').value) || 0,
    maxMembers: parseInt(document.getElementById('edit-club-max').value) || 18,
    description: document.getElementById('edit-club-description').value.trim(),
    teacher: document.getElementById('edit-club-teacher').value.trim() 
  };

  const pptFile = document.getElementById('edit-club-ppt').files[0];
  Swal.fire({ title: '정보 업데이트 중...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    if(pptFile) {
      const pRef = storageRef(storage, `ppts/${Date.now()}_${pptFile.name}`);
      await uploadBytes(pRef, pptFile);
      updates.pptUrl = await getDownloadURL(pRef);
      updates.pptName = pptFile.name;
    }
    await update(ref(db, `clubs/${clubId}`), updates);
    Toast.fire("업데이트 완료", "학생 상세정보에 반영되었습니다.", "success");
    
    if (updates.pptName) document.getElementById('current-ppt-name').textContent = `[등록됨] ${updates.pptName}`;
    document.getElementById('edit-club-ppt').value = '';
  } catch(e) { showAlert("오류", e.message, "error"); }
});

window.changeStatus = async (clubId, studentId, newStatus, currentAccepted, maxMembers) => {
  if (newStatus === '합격' && currentAccepted >= maxMembers) return showAlert("정원 초과", `현재 정원(${maxMembers}명)이 꽉 찼습니다!`, "warning");
  await update(ref(db, `applications/${clubId}/${studentId}`), { status: newStatus });
};

function renderClubs() {
  const grid = document.getElementById('club-grid');
  const search = document.getElementById('search-club') ? document.getElementById('search-club').value.toLowerCase() : "";
  if (!grid) return;
  grid.innerHTML = "";

  Object.entries(state.clubsData).forEach(([id, club]) => {
    const isAft = club.category.includes('방과 후 자율');
    if (state.currentStudentTab === 'regular' && isAft) return;
    if (state.currentStudentTab === 'afterschool' && !isAft) return;
    if (search && !club.clubName.toLowerCase().includes(search) && !club.teacher.toLowerCase().includes(search)) return;

    const apps = state.appsData[id] || {};
    const count = Object.values(apps).filter(a => a.status !== '탈락').length;
    const countColor = count >= (club.maxMembers || 18) ? 'text-rose-500' : 'text-indigo-600';
    
    const card = document.createElement('div');
    card.className = "bg-white p-6 rounded-[1.5rem] border-2 border-transparent shadow-sm hover:border-indigo-400 hover:shadow-xl hover:-translate-y-1 transition-all cursor-pointer flex flex-col justify-between";
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-center mb-4">
          <span class="text-[11px] font-black bg-indigo-50 text-indigo-600 px-3 py-1.5 rounded-lg">${club.category}</span>
          <span class="text-[11px] font-bold text-gray-500 bg-gray-50 border px-2 py-1 rounded-md">${club.recruitMethod || '안내 없음'}</span>
        </div>
        <h4 class="text-2xl font-black mt-2 mb-1 text-gray-800 break-words">${club.clubName}</h4>
        <p class="text-sm text-gray-400 font-medium">${club.teacher} 선생님</p>
      </div>
      <div class="mt-6 flex justify-between items-center pt-4 border-t border-gray-100">
        <span class="text-xs font-bold text-gray-400">클릭하여 요강 확인 ❯</span>
        <span class="text-sm font-black ${countColor} bg-gray-50 px-3 py-1.5 rounded-xl border">${count} <span class="text-gray-400 text-xs">/ ${club.maxMembers || 18}명</span></span>
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
  document.getElementById('modal-method').textContent = club.recruitMethod || '아직 등록되지 않았습니다.';
  document.getElementById('modal-members').textContent = `최소 ${club.minMembers || 0}명 / 최대 ${club.maxMembers || 18}명`;
  document.getElementById('modal-description').textContent = club.description || "선생님이 아직 동아리 소개글을 등록하지 않았습니다.";
  
  const pptArea = document.getElementById('modal-ppt-area');
  if (club.pptUrl) {
    pptArea.classList.remove('hidden');
    document.getElementById('modal-ppt-link').href = club.pptUrl;
  } else { pptArea.classList.add('hidden'); }

  document.getElementById('club-detail-modal').classList.remove('hidden');
}

const btnCloseModal = document.getElementById('btn-close-modal');
if(btnCloseModal) btnCloseModal.onclick = () => document.getElementById('club-detail-modal').classList.add('hidden');

const btnModalApply = document.getElementById('btn-modal-apply');
if(btnModalApply) {
  btnModalApply.onclick = async () => {
    if (!state.currentStudent) return showAlert("오류", "학생 매칭 정보가 없어 신청이 불가합니다.", "error");
    const club = state.clubsData[state.selectedClubId];
    
    const myApps = Object.entries(state.appsData).filter(([cid, apps]) => apps[state.currentStudent.id] && apps[state.currentStudent.id].status !== '탈락');
    const normalCount = myApps.filter(([cid]) => !state.clubsData[cid]?.category.includes('방과 후 자율')).length;
    const afterCount = myApps.filter(([cid]) => state.clubsData[cid]?.category.includes('방과 후 자율')).length;

    const isTargetAft = club.category.includes('방과 후 자율');
    
    if (myApps.some(([cid]) => cid === state.selectedClubId)) return showAlert("신청 불가", "이미 신청한 동아리입니다.", "error");
    if (!isTargetAft && normalCount >= 1) return showAlert("신청 제한", "정규 동아리는 1개만 가능합니다.", "error");
    if (isTargetAft && afterCount >= 2) return showAlert("신청 제한", "자율 동아리는 최대 2개만 가능합니다.", "error");

    const res = await Swal.fire({ title: '해당 동아리에 지원합니다.', text: `모집 방법: ${club.recruitMethod || '선착순'}`, icon: 'question', showCancelButton: true, confirmButtonText: '네, 지원합니다', confirmButtonColor: '#4F46E5' });
    if (res.isConfirmed) {
      await set(ref(db, `applications/${state.selectedClubId}/${state.currentStudent.id}`), {
        name: state.currentStudent.name, grade: state.currentStudent.grade, classNum: state.currentStudent.classNum, status: "대기중", timestamp: Date.now()
      });
      document.getElementById('club-detail-modal').classList.add('hidden');
      Toast.fire("지원 완료", "", "success");
    }
  };
}

const btnRegular = document.getElementById('tab-student-regular');
const btnAfterschool = document.getElementById('tab-student-afterschool');

if(btnRegular && btnAfterschool) {
  btnRegular.onclick = () => {
    state.currentStudentTab = 'regular';
    btnRegular.className = "flex-1 py-3 text-center rounded-xl bg-white shadow text-indigo-600 font-extrabold transition-all";
    btnAfterschool.className = "flex-1 py-3 text-center rounded-xl text-gray-500 font-medium hover:text-gray-700 transition-all";
    renderClubs();
  };

  btnAfterschool.onclick = () => {
    state.currentStudentTab = 'afterschool';
    btnAfterschool.className = "flex-1 py-3 text-center rounded-xl bg-white shadow text-indigo-600 font-extrabold transition-all";
    btnRegular.className = "flex-1 py-3 text-center rounded-xl text-gray-500 font-medium hover:text-gray-700 transition-all";
    renderClubs();
  };
}

const searchClub = document.getElementById('search-club');
if(searchClub) searchClub.oninput = renderClubs;
const filterGrade = document.getElementById('filter-grade');
if(filterGrade) filterGrade.onchange = renderAllStudentsTable;
const filterClass = document.getElementById('filter-class');
if(filterClass) filterClass.onchange = renderAllStudentsTable;
const filterName = document.getElementById('filter-name');
if(filterName) filterName.oninput = renderAllStudentsTable;

function renderStudentStatus() {
  const box = document.getElementById('my-status-box'); 
  if(!box) return;
  box.innerHTML = "";
  if (!state.currentStudent) return;

  Object.entries(state.appsData).forEach(([cid, apps]) => {
    const my = apps[state.currentStudent.id];
    if (!my) return;
    
    const club = state.clubsData[cid];
    const div = document.createElement('div');
    div.className = "flex flex-col sm:flex-row justify-between items-center p-4 bg-white rounded-2xl shadow-sm border border-l-8 border-indigo-500 mb-2 gap-3";
    
    const infoDiv = document.createElement('div');
    infoDiv.className = "flex items-center gap-3";
    infoDiv.innerHTML = `<span class="font-extrabold text-lg">${club?.clubName || '동아리'}</span><span class="text-sm px-3 py-1 rounded-lg bg-indigo-50 text-indigo-600 font-bold border">${my.status}</span>`;
    div.appendChild(infoDiv);

    if (my.status === '합격' || my.status === '탈락') {
      const span = document.createElement('span');
      span.className = "text-xs text-gray-400 font-bold bg-gray-100 px-3 py-2 rounded-lg";
      span.textContent = "확정 완료";
      div.appendChild(span);
    } else {
      const cancelBtn = document.createElement('button');
      cancelBtn.className = "text-sm text-rose-500 hover:bg-rose-50 border border-rose-200 px-4 py-2 rounded-xl font-bold transition-all";
      cancelBtn.textContent = "지원 취소";
      
      cancelBtn.addEventListener('click', async () => {
        const res = await Swal.fire({ 
          title: '지원을 취소할까요?', 
          icon: 'warning', 
          showCancelButton: true, 
          confirmButtonColor: '#e11d48', 
          confirmButtonText: '취소하기', 
          cancelButtonText: '닫기' 
        });
        if(res.isConfirmed) {
          await remove(ref(db, `applications/${cid}/${state.currentStudent.id}`)); 
          Toast.fire("지원 취소 완료", "", "info");
        }
      });
      div.appendChild(cancelBtn);
    }
    
    box.appendChild(div);
  });

  if(box.innerHTML === "") {
    box.innerHTML = `<div class="p-8 text-center text-gray-400 font-medium bg-gray-50 rounded-2xl border border-dashed">지원 내역이 없습니다.</div>`;
  }
}

function renderAllStudentsTable() {
  const tbody = document.getElementById('all-students-tbody'); 
  if(!tbody) return;
  tbody.innerHTML = "";
  const [fGrade, fClass, fName] = [document.getElementById('filter-grade').value, document.getElementById('filter-class').value, document.getElementById('filter-name').value.trim().toLowerCase()];

  Object.entries(state.studentsData).forEach(([studentId, s]) => {
    if ((fGrade && String(s.grade) !== fGrade) || (fClass && String(s.classNum) !== fClass) || (fName && !s.name.toLowerCase().includes(fName))) return;
    
    let reg = "-", aft1 = "-", aft2 = "-";
    const myClubs = Object.entries(state.appsData).filter(([cid, apps]) => apps[studentId]);

    myClubs.forEach(([cid]) => {
      const c = state.clubsData[cid]; if(!c) return;
      const status = state.appsData[cid][studentId].status;
      const icon = status === '합격' ? '🟢' : (status === '탈락' ? '🔴' : '🟡');
      const t = `<span class="bg-gray-100 px-2 py-1 rounded text-xs font-bold border">${icon} ${c.clubName}</span>`;
      if(c.category.includes('방과 후 자율')) { if (aft1 === "-") aft1 = t; else aft2 = t; } 
      else { reg = t; }
    });

    const tr = document.createElement('tr'); tr.className = "hover:bg-indigo-50/40 border-b border-gray-100 text-sm";
    tr.innerHTML = `<td class="p-4 font-bold text-gray-500 whitespace-nowrap">${s.grade}-${s.classNum}</td><td class="p-4 font-black text-gray-800 whitespace-nowrap">${s.name}</td><td class="p-4">${reg}</td><td class="p-4">${aft1}</td><td class="p-4">${aft2}</td>`;
    tbody.appendChild(tr);
  });
}

const btnExcel = document.getElementById('btn-excel');
if(btnExcel) {
  btnExcel.addEventListener('click', () => {
    const clubId = document.getElementById('admin-club-select').value;
    if(!clubId || !state.appsData[clubId]) return showAlert("알림", "다운로드할 데이터가 없습니다.", "info");
    let csv = "data:text/csv;charset=utf-8,\uFEFF학년,반,이름,상태,신청일시\n"; 
    Object.values(state.appsData[clubId]).forEach(d => csv += `${d.grade},${d.classNum},${d.name},${d.status},"${new Date(d.timestamp).toLocaleString()}"\n`);
    const link = document.createElement("a"); link.setAttribute("href", encodeURI(csv)); link.setAttribute("download", `신청자명단.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
  });
}
// --- 동아리 삭제 기능 시작 ---
const editSection = document.getElementById('admin-club-edit-section');

if (editSection) {
  // 1. 삭제 버튼을 동적으로 생성 (HTML 건드릴 필요 없음!)
  const deleteBtn = document.createElement('button');
  deleteBtn.id = "btn-delete-club";
  deleteBtn.className = "bg-rose-500 hover:bg-rose-600 text-white px-5 py-3 rounded-xl font-black mt-6 w-full shadow-sm transition-all hidden";
  deleteBtn.textContent = "🚨 이 동아리 영구 삭제하기 (전체 관리자 전용)";
  
  // 관리자 수정 섹션 맨 아래에 버튼 쏙 넣기
  editSection.appendChild(deleteBtn);

  // 2. 관리자가 동아리를 선택했을 때, '전체 관리자'인 경우에만 버튼 보이기
  document.getElementById('admin-club-select').addEventListener('change', (e) => {
    if (e.target.value && state.isSuperAdmin) {
      deleteBtn.classList.remove('hidden');
    } else {
      deleteBtn.classList.add('hidden');
    }
  });

  // 3. 삭제 버튼 클릭 시 작동할 로직
  deleteBtn.addEventListener('click', async () => {
    if (!state.isSuperAdmin) return showAlert("권한 오류", "전체 관리자만 삭제할 수 있습니다.", "error");
    
    const clubId = document.getElementById('admin-club-select').value;
    if (!clubId) return;

    // 강력한 경고창 띄우기
    const res = await Swal.fire({
      title: '정말 삭제할까요?',
      text: "이 동아리와 학생들의 모든 지원 내역까지 영구 삭제됩니다! (복구 불가)",
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#e11d48', // 빨간색 버튼
      confirmButtonText: '네, 삭제합니다',
      cancelButtonText: '취소'
    });

    if (res.isConfirmed) {
      Swal.fire({ title: '삭제 처리 중...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
      try {
        // 파이어베이스에서 '동아리 정보' & '해당 동아리 학생 지원 내역' 동시 날리기
        await remove(ref(db, `clubs/${clubId}`));
        await remove(ref(db, `applications/${clubId}`));
        
        Swal.fire("삭제 완료!", "동아리가 흔적도 없이 삭제되었습니다.", "success");
        
        // 화면 초기화
        document.getElementById('admin-club-select').value = "";
        renderAdminList(); 
      } catch(e) {
        showAlert("삭제 실패", e.message, "error");
      }
    }
  });
}
// --- 동아리 삭제 기능 끝 ---