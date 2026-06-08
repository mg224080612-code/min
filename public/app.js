import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
// query, orderByChild, equalTo가 추가되었습니다.
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

// 상태 관리
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

// 유틸리티
const Toast = Swal.mixin({ toast: true, position: 'top', showConfirmButton: false, timer: 3000, timerProgressBar: true });
const showAlert = (title, text, icon = 'info') => Swal.fire({ title, text, icon, confirmButtonColor: '#4F46E5', borderRadius: '1.5rem' });

// 파일 첨부 UI 업데이트
document.getElementById('create-club-file').addEventListener('change', function() {
  const fileNameDisplay = document.getElementById('file-name-display');
  if(this.files && this.files[0]) {
    fileNameDisplay.textContent = this.files[0].name;
    fileNameDisplay.classList.add('text-indigo-600');
  } else {
    fileNameDisplay.textContent = '클릭하여 파일을 선택하거나 드래그하세요';
    fileNameDisplay.classList.remove('text-indigo-600');
  }
});

// 로그인
document.getElementById('btn-google-login').addEventListener('click', () => {
  provider.setCustomParameters({ hd: 'gvcs-mg.org' });
  signInWithPopup(auth, provider).catch(err => showAlert("로그인 실패", err.message, "error"));
});

onAuthStateChanged(auth, async (user) => {
  // 로그인 시 모든 뷰 초기화
  const views = ['view-login', 'view-student', 'view-admin', 'nav-tabs'];
  views.forEach(id => document.getElementById(id).classList.add('hidden'));

  if (user) {
    if (!user.email.endsWith('@gvcs-mg.org')) {
      showAlert("접근 제한", "학교 계정으로만 로그인할 수 있습니다.", "error");
      await signOut(auth); return;
    }

    state.currentUser = user;
    const emailPrefix = user.email.split('@')[0];
    
    state.isSuperAdmin = SUPER_ADMINS.includes(user.email);
    state.isTeacher = !state.isSuperAdmin && /^[a-zA-Z]+$/.test(emailPrefix); 

    let roleText = state.isSuperAdmin ? '최고 관리자' : (state.isTeacher ? '선생님' : '학생');

    const userInfoEl = document.getElementById('user-info');
    userInfoEl.innerHTML = `
      <span>👤 ${user.email} <span class="text-indigo-600 ml-1">(${roleText})</span></span> 
      <button id="btn-logout" class="ml-2 bg-gray-100 hover:bg-rose-50 text-rose-500 px-3 py-1.5 rounded-lg text-sm font-extrabold transition-all border border-gray-200 hover:border-rose-200">로그아웃</button>
    `;
    userInfoEl.classList.remove('hidden');
    document.getElementById('btn-logout').addEventListener('click', () => signOut(auth));

    if (state.isSuperAdmin || state.isTeacher) {
      document.getElementById('nav-tabs').classList.remove('hidden');
      setupAdminTabs();
      document.getElementById('view-admin').classList.remove('hidden');
      initAdminData();
      
      await checkStudentProfile(); // 관리자도 DB 체크 및 initStudentData 실행
      document.getElementById('tab-manage-club').click(); // 기본 탭 활성화
    } else {
      await checkStudentProfile(); // 학생은 프로필 확인 후 뷰 전환
    }
  } else {
    document.getElementById('view-login').classList.remove('hidden');
    document.getElementById('user-info').classList.add('hidden');
  }
});

// 권한에 따른 탭 표시
function setupAdminTabs() {
  const tStudentView = document.getElementById('tab-student-view');
  const tManageClub = document.getElementById('tab-manage-club');
  const tAllStudents = document.getElementById('tab-all-students');
  const tCreateClub = document.getElementById('tab-create-club');
  const tApproveClub = document.getElementById('tab-approve-club');

  [tStudentView, tManageClub, tAllStudents, tCreateClub, tApproveClub].forEach(el => el.classList.add('hidden'));

  if(state.isTeacher || state.isSuperAdmin) {
    tManageClub.classList.remove('hidden');
    tAllStudents.classList.remove('hidden');
    tCreateClub.classList.remove('hidden');
  }
  
  if (state.isSuperAdmin) {
    tStudentView.classList.remove('hidden');
    tApproveClub.classList.remove('hidden');
  }
}

// 탭 클릭 로직
const allTabs = ['manage-club', 'all-students', 'create-club', 'approve-club', 'student-view'];
allTabs.forEach(tab => {
  const el = document.getElementById(`tab-${tab}`);
  if(!el) return;
  el.addEventListener('click', (e) => {
    allTabs.forEach(t => {
      const btn = document.getElementById(`tab-${t}`);
      if(btn) {
        btn.classList.remove('tab-active');
        btn.classList.add('tab-inactive');
      }
    });
    e.target.classList.remove('tab-inactive');
    e.target.classList.add('tab-active');

    document.getElementById('view-admin').classList.add('hidden');
    document.getElementById('view-student').classList.add('hidden');
    document.getElementById('admin-section-manage').classList.add('hidden');
    document.getElementById('admin-section-all').classList.add('hidden');
    document.getElementById('admin-section-create').classList.add('hidden');
    document.getElementById('admin-section-approve').classList.add('hidden');

    if (tab === 'student-view') {
      document.getElementById('view-student').classList.remove('hidden');
    } else {
      document.getElementById('view-admin').classList.remove('hidden');
      document.getElementById(`admin-section-${tab.split('-')[0]}`).classList.remove('hidden');
      if(tab === 'all-students') renderAllStudentsTable();
      if(tab === 'approve-club') renderPendingClubs();
    }
  });
});

// ----------------------------------------------------
// 로그인 이메일로 DB에서 학생 매칭
// ----------------------------------------------------
// ----------------------------------------------------
// 로그인 이메일로 DB에서 학생 매칭 (숫자형 구조 및 배열 완벽 대응)
// ----------------------------------------------------
async function checkStudentProfile() {
  try {
    const userEmail = state.currentUser.email.trim().toLowerCase();
    
    // DB에서 students 데이터를 전부 가져옵니다.
    const snapshot = await get(ref(db, 'students'));
    
    if (snapshot.exists()) {
      const studentsData = snapshot.val();
      let foundStudent = null;
      let foundId = null;

      // Firebase가 객체나 배열 어떤 형태로 데이터를 주더라도 처리 가능하도록 Object.keys 사용
      const keys = Object.keys(studentsData);
      
      for (const key of keys) {
        const student = studentsData[key];
        
        // 데이터가 비어있거나(null) 객체가 아닌 경우 건너뜀 (에러 방지 핵심)
        if (!student || typeof student !== 'object') continue;

        const dbEmail = student.email || student.Email || student['이메일'];
        
        // 이메일 양쪽 공백 제거 및 소문자 변환 후 비교
        if (dbEmail && dbEmail.trim().toLowerCase() === userEmail) {
          foundStudent = student;
          foundId = key;
          break; // 찾았으면 반복문 종료
        }
      }

      if (foundStudent) {
        // 매칭 성공! 학생 정보 세팅
        state.currentStudent = { id: foundId, ...foundStudent };
        
        // 일반 학생일 경우 학생 뷰 노출
        if (!state.isSuperAdmin && !state.isTeacher) {
          document.getElementById('view-student').classList.remove('hidden');
        }
      } else {
        // 매칭 실패 (DB에 해당 이메일이 없음)
        if (!state.isSuperAdmin && !state.isTeacher) {
          Swal.fire({
            title: "학생 정보 없음", 
            text: `데이터베이스에서 ${state.currentUser.email} 계정을 찾을 수 없습니다.`, 
            icon: "error",
            confirmButtonColor: '#4F46E5'
          });
        }
      }
    }
    
    // 정상적으로 화면 데이터 로드
    initStudentData();

  } catch (error) {
    console.error("실행 중 에러 발생:", error);
    Swal.fire("오류 발생", "데이터를 불러오는 중 문제가 발생했습니다.", "error");
  }
}

function initStudentData() {
  onValue(ref(db, 'clubs'), (snapshot) => { state.clubsData = snapshot.val() || {}; renderClubs(); });
  onValue(ref(db, 'applications'), (snapshot) => { state.appsData = snapshot.val() || {}; renderClubs(); renderStudentStatus(); });
}

function initAdminData() {
  onValue(ref(db, 'clubs'), (snapshot) => { state.clubsData = snapshot.val() || {}; renderAdminDropdown(); });
  onValue(ref(db, 'applications'), (snapshot) => { state.appsData = snapshot.val() || {}; renderAdminList(); if(state.isSuperAdmin || state.isTeacher) renderAllStudentsTable(); });
  onValue(ref(db, 'students'), (snapshot) => { state.studentsData = snapshot.val() || {}; if(state.isSuperAdmin || state.isTeacher) renderAllStudentsTable(); });
  onValue(ref(db, 'club_applications'), (snapshot) => { state.pendingClubsData = snapshot.val() || {}; if(state.isSuperAdmin) renderPendingClubs(); });
}

// ----------------------------------------------------
// 교사: 동아리 개설 신청 (파일 업로드 포함)
// ----------------------------------------------------
document.getElementById('btn-create-club').addEventListener('click', async () => {
  const name = document.getElementById('create-club-name').value.trim();
  const category = document.getElementById('create-club-category').value;
  const teacher = document.getElementById('create-club-teacher').value.trim();
  const max = parseInt(document.getElementById('create-club-max').value);
  const fileInput = document.getElementById('create-club-file');
  const email = state.currentUser.email;

  if(!name || !max || !teacher) return showAlert("입력 오류", "동아리명, 정원, 담당교사 이름을 모두 입력하세요.", "error");
  if(!fileInput.files.length) return showAlert("파일 첨부 누락", "동아리 운영 계획서를 첨부해주세요.", "warning");

  const file = fileInput.files[0];
  if(file.size > 10 * 1024 * 1024) return showAlert("용량 초과", "파일 크기는 10MB 이하여야 합니다.", "error");

  Swal.fire({ title: '신청서 제출 중...', text: '파일을 업로드하고 있습니다. 잠시만 기다려주세요.', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const fileName = `${Date.now()}_${file.name}`;
    const sRef = storageRef(storage, `club_plans/${fileName}`);
    await uploadBytes(sRef, file);
    const fileUrl = await getDownloadURL(sRef);

    const newAppRef = push(ref(db, 'club_applications'));
    await set(newAppRef, { 
      clubName: name, category, teacher, email, maxMembers: max, fileUrl, fileName: file.name, status: '대기중', timestamp: Date.now() 
    });
    
    Swal.fire({ title: "신청 완료!", text: "관리자 승인 후 동아리가 개설됩니다.", icon: "success", confirmButtonColor: '#4F46E5', borderRadius: '1.5rem' });
    
    document.getElementById('create-club-name').value = '';
    document.getElementById('create-club-teacher').value = '';
    fileInput.value = '';
    document.getElementById('file-name-display').textContent = '클릭하여 파일을 선택하거나 드래그하세요';
    document.getElementById('file-name-display').classList.remove('text-indigo-600');
    
  } catch (error) {
    showAlert("오류 발생", "신청 중 문제가 발생했습니다: " + error.message, "error");
  }
});

// ----------------------------------------------------
// 관리자: 개설 승인 관리
// ----------------------------------------------------
function renderPendingClubs() {
  const listEl = document.getElementById('pending-club-list');
  listEl.innerHTML = '';
  const keys = Object.keys(state.pendingClubsData);

  if(keys.length === 0) {
    listEl.innerHTML = '<li class="p-10 border-2 border-dashed border-gray-200 rounded-2xl text-center text-gray-400 font-medium">현재 대기 중인 신청이 없습니다.</li>';
    return;
  }

  keys.forEach(id => {
    const data = state.pendingClubsData[id];
    const li = document.createElement('li');
    li.className = "p-6 border border-gray-200 rounded-2xl bg-white shadow-sm flex flex-col md:flex-row justify-between md:items-center gap-4 hover:border-indigo-300 transition-all";
    
    li.innerHTML = `
      <div>
        <div class="flex items-center gap-2 mb-2">
          <span class="bg-gray-100 text-gray-600 text-xs font-bold px-2.5 py-1 rounded-md">${data.category}</span>
          <span class="text-xs text-gray-400">${new Date(data.timestamp).toLocaleDateString()} 신청</span>
        </div>
        <h4 class="text-xl font-extrabold text-gray-800 mb-1">${data.clubName} <span class="text-base text-gray-500 font-medium ml-1">(${data.maxMembers}명)</span></h4>
        <p class="text-sm text-gray-600 font-medium mb-3">🧑‍🏫 담당교사: ${data.teacher} (${data.email})</p>
        <a href="${data.fileUrl}" target="_blank" class="inline-flex items-center gap-1.5 text-sm font-bold text-indigo-600 bg-indigo-50 px-3 py-1.5 rounded-lg hover:bg-indigo-100 transition">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
          계획서 다운로드 (${data.fileName})
        </a>
      </div>
      <div class="flex gap-2 w-full md:w-auto mt-2 md:mt-0">
        <button onclick="approveClub('${id}')" class="flex-1 md:flex-none bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold shadow-md hover:bg-indigo-700 transition">승인</button>
        <button onclick="rejectClub('${id}')" class="flex-1 md:flex-none bg-rose-100 text-rose-600 px-6 py-3 rounded-xl font-bold hover:bg-rose-200 transition">거절</button>
      </div>
    `;
    listEl.appendChild(li);
  });
}

window.approveClub = async (appId) => {
  const data = state.pendingClubsData[appId];
  if(!data) return;
  const result = await Swal.fire({ title: '승인하시겠습니까?', text: `${data.clubName} 동아리가 학생들에게 노출됩니다.`, icon: 'question', showCancelButton: true, confirmButtonText: '승인', cancelButtonText: '취소' });
  if(result.isConfirmed) {
    const newClubRef = push(ref(db, 'clubs'));
    await set(newClubRef, { clubName: data.clubName, category: data.category, teacher: data.teacher, email: data.email, maxMembers: data.maxMembers });
    await remove(ref(db, `club_applications/${appId}`));
    Toast.fire({ icon: 'success', title: '동아리가 승인 및 개설되었습니다.' });
  }
};

window.rejectClub = async (appId) => {
  const result = await Swal.fire({ title: '거절하시겠습니까?', text: "이 신청 기록이 삭제됩니다.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#e11d48', confirmButtonText: '거절 삭제', cancelButtonText: '취소' });
  if(result.isConfirmed) {
    await remove(ref(db, `club_applications/${appId}`));
    Toast.fire({ icon: 'info', title: '신청이 거절되었습니다.' });
  }
};

// ----------------------------------------------------
// 학생 및 공통 UI 로직
// ----------------------------------------------------
document.getElementById('search-club').addEventListener('input', renderClubs);

function renderClubs() {
  const grid = document.getElementById('club-grid');
  const searchQuery = document.getElementById('search-club').value.toLowerCase().trim();
  grid.innerHTML = '';
  
  Object.keys(state.clubsData).forEach(key => {
    const club = state.clubsData[key];
    const isAfterSchool = club.category.includes('방과 후 자율');
    
    if (state.currentStudentTab === 'regular' && isAfterSchool) return;
    if (state.currentStudentTab === 'afterschool' && !isAfterSchool) return;

    if (searchQuery) {
      if (!club.clubName.toLowerCase().includes(searchQuery) && !club.teacher.toLowerCase().includes(searchQuery)) return;
    }

    const maxMembers = club.maxMembers || 18;
    const applicants = state.appsData[key] || {};
    let activeCount = Object.values(applicants).filter(app => app.status !== '탈락').length;
    
    const countColor = activeCount >= maxMembers ? 'text-rose-600 font-extrabold' : 'text-indigo-600 font-extrabold';
    const isSelected = state.selectedClubId === key ? 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100 shadow-md transform -translate-y-1' : 'border-gray-200 bg-white hover:border-indigo-300 hover:shadow-lg hover:-translate-y-1';
    
    const card = document.createElement('div');
    card.className = `border-2 p-6 rounded-[1.5rem] cursor-pointer transition-all duration-300 flex flex-col justify-between ${isSelected}`;
    card.innerHTML = `
      <div>
        <div class="flex justify-between items-start mb-4">
          <span class="text-xs font-extrabold text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-lg">${club.category}</span>
        </div>
        <h4 class="font-extrabold text-2xl text-gray-800 mb-2 leading-tight">${club.clubName}</h4>
        <p class="text-sm text-gray-500 mb-4 font-medium flex items-center gap-1.5"><svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>${club.teacher} 선생님</p>
      </div>
      <div class="mt-auto pt-4 border-t border-gray-100 flex justify-between items-center bg-gray-50/50 -mx-6 -mb-6 p-4 rounded-b-[1.3rem]">
        <span class="text-sm font-bold text-gray-500">현재 지원율</span>
        <span class="${countColor} text-lg bg-white px-3 py-1 rounded-lg border shadow-sm">${activeCount} <span class="text-xs text-gray-400 font-medium">/ ${maxMembers}명</span></span>
      </div>
    `;
    card.addEventListener('click', () => { state.selectedClubId = key; renderClubs(); });
    grid.appendChild(card);
  });
}

['regular', 'afterschool'].forEach(tab => {
  document.getElementById(`tab-student-${tab}`).addEventListener('click', () => {
    state.currentStudentTab = tab; state.selectedClubId = null; document.getElementById('search-club').value = ''; 
    const btnReg = document.getElementById('tab-student-regular');
    const btnAft = document.getElementById('tab-student-afterschool');
    const activeClass = "flex-1 py-3.5 text-center rounded-xl bg-white shadow text-indigo-600 font-extrabold transition-all text-lg";
    const inactiveClass = "flex-1 py-3.5 text-center rounded-xl text-gray-500 font-medium hover:text-gray-700 transition-all text-lg hover:bg-gray-200/50";
    if (tab === 'regular') { btnReg.className = activeClass; btnAft.className = inactiveClass; } 
    else { btnReg.className = inactiveClass; btnAft.className = activeClass; }
    renderClubs();
  });
});

document.getElementById('btn-apply').addEventListener('click', async () => {
  if (!state.selectedClubId) return showAlert("안내", "위 목록에서 동아리를 먼저 선택해주세요.", "warning");
  const targetClub = state.clubsData[state.selectedClubId];
  const isTargetAfterSchool = targetClub.category.includes('방과 후 자율');

  let afterSchoolCount = 0, normalCount = 0;
  for (const clubId in state.appsData) {
    const myApp = state.appsData[clubId][state.currentStudent?.id];
    if (myApp && myApp.status !== '탈락') {
      if (clubId === state.selectedClubId) return showAlert("신청 불가", "이미 신청(대기/합격)한 동아리입니다.", "error");
      const cInfo = state.clubsData[clubId];
      if (cInfo) { cInfo.category.includes('방과 후 자율') ? afterSchoolCount++ : normalCount++; }
    }
  }

  if (isTargetAfterSchool && afterSchoolCount >= 2) return showAlert("제한", "방과 후 자율 동아리는 최대 2개까지만 신청 가능합니다.", "error");
  if (!isTargetAfterSchool && normalCount >= 1) return showAlert("제한", "정규 동아리는 1개만 신청 가능합니다.", "error");

  const result = await Swal.fire({ title: '신청하시겠습니까?', text: `[${targetClub.clubName}] 동아리에 지원합니다.`, icon: 'question', showCancelButton: true, confirmButtonColor: '#4F46E5', confirmButtonText: '네, 신청할게요!', cancelButtonText: '취소', borderRadius:'1.5rem' });

  if(result.isConfirmed) {
    await set(ref(db, `applications/${state.selectedClubId}/${state.currentStudent.id}`), {
      name: state.currentStudent.name, grade: state.currentStudent.grade, classNum: state.currentStudent.classNum, status: "대기중", timestamp: Date.now()
    });
    Toast.fire({ icon: 'success', title: '성공적으로 신청되었습니다!' });
    state.selectedClubId = null;
  }
});

function renderStudentStatus() {
  let statusHtml = ""; 
  for (const clubId in state.appsData) {
    const myData = state.appsData[clubId][state.currentStudent?.id];
    if (myData) {
      const clubName = state.clubsData[clubId]?.clubName || "삭제된 동아리";
      let colorClass = "text-amber-700 bg-amber-50 border-amber-200 border-l-amber-500";
      if(myData.status === '합격') colorClass = "text-emerald-700 bg-emerald-50 border-emerald-200 border-l-emerald-500";
      if(myData.status === '탈락') colorClass = "text-rose-700 bg-rose-50 border-rose-200 border-l-rose-500";

      const isLocked = myData.status === '합격' || myData.status === '탈락';
      const btnHtml = isLocked 
        ? `<span class="text-xs text-gray-400 font-bold bg-gray-100/80 px-4 py-2 rounded-xl">변경 불가</span>`
        : `<button onclick="cancelApplication('${clubId}')" class="text-sm bg-white hover:bg-rose-50 text-rose-500 py-2 px-5 border border-rose-200 rounded-xl transition-all font-bold shadow-sm hover:shadow">지원 취소</button>`;

      statusHtml += `
        <div class="flex flex-col sm:flex-row justify-between items-center p-5 rounded-2xl shadow-sm border border-l-8 ${colorClass}">
          <div class="flex items-center gap-4 mb-4 sm:mb-0">
            <span class="font-extrabold text-lg md:text-xl text-gray-800">${clubName}</span>
            <span class="font-extrabold border bg-white px-3 py-1 rounded-lg text-sm shadow-sm ${colorClass.split(' ')[0]}">${myData.status}</span>
          </div>
          ${btnHtml}
        </div>
      `;
    }
  }
  document.getElementById('my-status-box').innerHTML = statusHtml || `<div class="p-10 bg-white rounded-[1.5rem] border border-dashed border-gray-300 text-gray-400 text-center font-medium">아직 신청한 동아리가 없습니다. 목록에서 선택하여 지원해보세요!</div>`;
}

window.cancelApplication = async (clubId) => {
  const result = await Swal.fire({ title: '지원을 취소할까요?', text: "이 작업은 되돌릴 수 없습니다.", icon: 'warning', showCancelButton: true, confirmButtonColor: '#e11d48', confirmButtonText: '네, 취소합니다', cancelButtonText: '아니요', borderRadius:'1.5rem' });
  if(result.isConfirmed) {
    await remove(ref(db, `applications/${clubId}/${state.currentStudent.id}`)); 
    Toast.fire({ icon: 'info', title: '신청이 취소되었습니다.' });
  }
};

// ----------------------------------------------------
// 관리자: 동아리 인원 관리 탭
// ----------------------------------------------------
function renderAdminDropdown() {
  const adminSelect = document.getElementById('admin-club-select');
  const currentVal = adminSelect.value;
  adminSelect.innerHTML = '<option value="">▼ 관리할 동아리를 선택하세요</option>';
  Object.keys(state.clubsData).forEach(key => {
    const club = state.clubsData[key];
    if (state.isTeacher && !state.isSuperAdmin && club.email !== state.currentUser.email) return; 
    adminSelect.innerHTML += `<option value="${key}">${club.clubName} (정원: ${club.maxMembers || 18}명)</option>`;
  });
  if(state.clubsData[currentVal]) adminSelect.value = currentVal;
}

document.getElementById('admin-club-select').addEventListener('change', renderAdminList);

function renderAdminList() {
  const clubId = document.getElementById('admin-club-select').value;
  const listEl = document.getElementById('applicant-list');
  if(!clubId) {
    listEl.innerHTML = '<li class="p-10 border-2 border-dashed border-gray-200 rounded-2xl text-center text-gray-400 font-medium">동아리를 선택해 주세요.</li>';
    document.getElementById('accepted-count').textContent = '0';
    document.getElementById('max-count').textContent = '0';
    return;
  }
  const clubInfo = state.clubsData[clubId];
  const maxMembers = clubInfo.maxMembers || 18;
  document.getElementById('max-count').textContent = maxMembers;

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
    li.className = "flex flex-col sm:flex-row justify-between items-center p-6 border border-gray-200 rounded-2xl bg-white shadow-sm gap-4 hover:border-indigo-300 transition-all";
    
    const info = `<div class="flex items-center gap-3"><div class="w-10 h-10 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center font-bold">${data.grade}</div><span class="text-lg text-gray-500 font-medium">${data.classNum}반 <span class="font-extrabold text-xl text-gray-900 ml-1">${data.name}</span></span></div>`;
    let buttons = '';
    
    if (data.status === '대기중') {
      buttons = `<div class="flex w-full sm:w-auto gap-2">
          <button onclick="changeStatus('${clubId}', '${studentId}', '합격', ${acceptedCount}, ${maxMembers})" class="flex-1 sm:flex-none bg-emerald-500 text-white px-6 py-2.5 rounded-xl hover:bg-emerald-600 font-bold shadow-sm transition">합격</button>
          <button onclick="changeStatus('${clubId}', '${studentId}', '탈락', ${acceptedCount}, ${maxMembers})" class="flex-1 sm:flex-none bg-rose-500 text-white px-6 py-2.5 rounded-xl hover:bg-rose-600 font-bold shadow-sm transition">탈락</button>
        </div>`;
    } else {
      const statusColor = data.status === '합격' ? 'text-emerald-600 bg-emerald-50' : 'text-rose-600 bg-rose-50';
      buttons = `<div class="flex items-center gap-4">
          <span class="font-extrabold ${statusColor} border border-transparent px-4 py-1.5 rounded-xl text-lg">${data.status}</span>
          <button onclick="changeStatus('${clubId}', '${studentId}', '대기중', ${acceptedCount}, ${maxMembers})" class="text-sm text-gray-400 border-b border-gray-400 hover:text-gray-700 transition font-medium pb-0.5">상태 초기화</button>
        </div>`;
    }
    li.innerHTML = `${info} ${buttons}`;
    listEl.appendChild(li);
  });
}

window.changeStatus = async (clubId, studentId, newStatus, currentAccepted, maxMembers) => {
  if (newStatus === '합격' && currentAccepted >= maxMembers) return showAlert("정원 초과", `현재 정원(${maxMembers}명)이 꽉 찼습니다!`, "warning");
  await update(ref(db), { [`applications/${clubId}/${studentId}/status`]: newStatus });
};

// ----------------------------------------------------
// 관리자: 전체 명단
// ----------------------------------------------------
document.getElementById('filter-grade').addEventListener('change', renderAllStudentsTable);
document.getElementById('filter-class').addEventListener('change', renderAllStudentsTable);
document.getElementById('filter-name').addEventListener('input', renderAllStudentsTable);

function renderAllStudentsTable() {
  const tbody = document.getElementById('all-students-tbody');
  tbody.innerHTML = '';
  const filterGrade = document.getElementById('filter-grade').value;
  const filterClass = document.getElementById('filter-class').value;
  const filterName = document.getElementById('filter-name').value.trim().toLowerCase();
  const studentMap = {}; 
  
  for(const uid in state.studentsData) {
    const s = state.studentsData[uid];
    if (filterGrade && String(s.grade) !== String(filterGrade)) continue;
    if (filterClass && String(s.classNum) !== String(filterClass)) continue;
    if (filterName && !s.name.toLowerCase().includes(filterName)) continue;
    studentMap[uid] = { info: s, regular: [], afterSchool: [] };
  }

  for (const clubId in state.appsData) {
    const category = state.clubsData[clubId]?.category || '기타';
    const clubName = state.clubsData[clubId]?.clubName || '삭제된동아리';
    for (const uid in state.appsData[clubId]) {
      if(!studentMap[uid]) continue; 
      const st = state.appsData[clubId][uid].status;
      const stText = st === '합격' ? '🟢' : st === '탈락' ? '🔴' : '🟡';
      const dText = `<span class="flex items-center gap-1.5 font-bold bg-gray-50 px-2 py-1 rounded-md border">${stText} ${clubName}</span>`;
      category.includes('방과 후 자율') ? studentMap[uid].afterSchool.push(dText) : studentMap[uid].regular.push(dText);
    }
  }

  const sortedStudents = Object.values(studentMap).sort((a, b) => {
    if (a.info.grade !== b.info.grade) return Number(a.info.grade) - Number(b.info.grade);
    if (a.info.classNum !== b.info.classNum) return Number(a.info.classNum) - Number(b.info.classNum);
    return a.info.name.localeCompare(b.info.name);
  });

  if (sortedStudents.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" class="p-10 text-center text-gray-400 font-medium">조건에 맞는 학생이 없습니다.</td></tr>';
    return;
  }

  sortedStudents.forEach(s => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-indigo-50/40 transition-colors border-b border-gray-100";
    tr.innerHTML = `
      <td class="p-5 text-gray-500 font-bold whitespace-nowrap">${s.info.grade}학년 ${s.info.classNum}반</td>
      <td class="p-5 text-gray-900 font-extrabold text-lg whitespace-nowrap">${s.info.name}</td>
      <td class="p-5 text-indigo-800 whitespace-nowrap">${s.regular[0] || '<span class="text-gray-300">-</span>'}</td>
      <td class="p-5 text-blue-800 whitespace-nowrap">${s.afterSchool[0] || '<span class="text-gray-300">-</span>'}</td>
      <td class="p-5 text-blue-800 whitespace-nowrap">${s.afterSchool[1] || '<span class="text-gray-300">-</span>'}</td>
    `;
    tbody.appendChild(tr);
  });
}

// 엑셀 다운로드
document.getElementById('btn-excel').addEventListener('click', () => {
  const clubId = document.getElementById('admin-club-select').value;
  if(!clubId || !state.appsData[clubId] || Object.keys(state.appsData[clubId]).length === 0) return showAlert("알림", "다운로드할 데이터가 없습니다.", "info");
  
  const applicants = state.appsData[clubId];
  let csvContent = "data:text/csv;charset=utf-8,\uFEFF학년,반,이름,상태,신청일시\n"; 
  for(const id in applicants) {
    const d = applicants[id];
    csvContent += `${d.grade},${d.classNum},${d.name},${d.status},"${new Date(d.timestamp).toLocaleString()}"\n`;
  }
  const link = document.createElement("a");
  link.setAttribute("href", encodeURI(csvContent));
  link.setAttribute("download", `${state.clubsData[clubId]?.clubName || "동아리"}_신청자명단.csv`);
  document.body.appendChild(link); link.click(); document.body.removeChild(link);
});