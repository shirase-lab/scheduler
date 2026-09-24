// store.js — Firestore への読み書きを1経路に集約。 #db #store #meeting #availability #master
// コレクション: users/{uid}(マスター設定) / meetings/{id} / meetings/{id}/availabilities/{uid}
import { db, auth } from './firebase.js';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  onSnapshot,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ---- マスター設定（ユーザーごとのデフォルト） ----

/** ユーザー別マスター設定の初期値 */
export function defaultMaster() {
  return {
    timezone: 'Asia/Tokyo',
    dayStart: '09:00',
    dayEnd: '18:00',
    notifyEmail: true,
    notifyDiscord: false,
    discordWebhook: '',
    calendarId: 'primary',
    createMeet: true,
  };
}

/** users/{uid} を取得（無ければ作成して既定を返す） */
export async function getOrCreateUser(user) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (snap.exists()) return snap.data();
  const data = {
    displayName: user.displayName || '',
    email: user.email || '',
    photoURL: user.photoURL || '',
    master: defaultMaster(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  await setDoc(ref, data);
  return data;
}

/** マスター設定を保存 */
export function saveMaster(uid, master) {
  return updateDoc(doc(db, 'users', uid), { master, updatedAt: serverTimestamp() });
}

// ---- 打ち合わせ ----

/**
 * 打ち合わせを新規作成。
 * @param {object} m {title, description, durationMin, candidateStartDate, candidateEndDate,
 *                    dayStart, dayEnd, participantEmails[], notify:{email,discord}}
 * @returns {Promise<string>} meetingId
 */
export async function createMeeting(m) {
  const u = auth.currentUser;
  const data = {
    ...m,
    organizerUid: u.uid,
    organizerName: u.displayName || '',
    organizerEmail: u.email || '',
    status: 'collecting',
    confirmedStart: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'meetings'), data);
  return ref.id;
}

export async function getMeeting(id) {
  const snap = await getDoc(doc(db, 'meetings', id));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

/** 自分が作成した打ち合わせ一覧（新しい順）。
 *  単一 where のみ（複合インデックス不要）で取得し、作成日時でクライアント側ソート。 */
export async function listMyMeetings(uid) {
  const q = query(collection(db, 'meetings'), where('organizerUid', '==', uid));
  const snap = await getDocs(q);
  const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  return rows.sort((a, b) => (ms(b.createdAt) - ms(a.createdAt)));
}

/** Firestore Timestamp | null → ミリ秒（未確定は 0 として末尾ではなく最新側に寄せない） */
function ms(ts) {
  return ts && typeof ts.toMillis === 'function' ? ts.toMillis() : 0;
}

/** 打ち合わせを確定（枠を保存し status を confirmed に） */
export function confirmMeeting(id, confirmedStart, confirmedEnd) {
  return updateDoc(doc(db, 'meetings', id), {
    status: 'confirmed',
    confirmedStart,
    confirmedEnd,
    updatedAt: serverTimestamp(),
  });
}

export function reopenMeeting(id) {
  return updateDoc(doc(db, 'meetings', id), {
    status: 'collecting',
    confirmedStart: null,
    confirmedEnd: null,
    updatedAt: serverTimestamp(),
  });
}

export function deleteMeeting(id) {
  return deleteDoc(doc(db, 'meetings', id));
}

// ---- 希望日時（可否）----

/**
 * 自分の可否スロットを保存（上書き）。
 * @param {string} meetingId
 * @param {string[]} slots 可能な 15分スロットキー配列
 */
export function saveAvailability(meetingId, slots) {
  const u = auth.currentUser;
  return setDoc(doc(db, 'meetings', meetingId, 'availabilities', u.uid), {
    uid: u.uid,
    displayName: u.displayName || u.email || '匿名',
    email: u.email || '',
    slots,
    updatedAt: serverTimestamp(),
  });
}

/** 自分の可否を取得（無ければ null） */
export async function getMyAvailability(meetingId) {
  const u = auth.currentUser;
  const snap = await getDoc(doc(db, 'meetings', meetingId, 'availabilities', u.uid));
  return snap.exists() ? snap.data() : null;
}

/**
 * 全員の可否をリアルタイム購読。集計に使う。
 * @param {string} meetingId
 * @param {(rows:object[]) => void} cb
 * @returns {() => void} unsubscribe
 */
export function watchAvailabilities(meetingId, cb) {
  const col = collection(db, 'meetings', meetingId, 'availabilities');
  return onSnapshot(col, (snap) => cb(snap.docs.map((d) => d.data())));
}
