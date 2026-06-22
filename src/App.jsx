import {
  BarChart3,
  BookOpen,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Download,
  Eye,
  Filter,
  Bookmark,
  RotateCcw,
  Settings,
  Shuffle,
  Target,
  Upload,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { EXAMPLE_TRANSLATIONS, SENTENCE_PATTERN_MEANINGS } from './data/displayTranslations.js';
import { LANGUAGE_CHUNK_ITEMS, LANGUAGE_CHUNK_VOCAB_ITEMS, LANGUAGE_CHUNK_WORD_ITEMS } from './data/languageChunks.js';
import studyData from './data/studyItems.json';

const STORAGE_KEY = 'medical-humanities-vocab-review-v4';
const EXPORT_VERSION = 4;
const MASTERED_STREAK = 3;
const CORRECT_AUTO_NEXT_MS = 760;

const TYPE_META = {
  word: { label: '单词', short: '词', className: 'type-word' },
  chunkWord: { label: '填空词', short: '填', className: 'type-chunk-word' },
  phrase: { label: '完整词组', short: '组', className: 'type-phrase' },
  sentence: { label: '翻译', short: '译', className: 'type-sentence' },
};

const MODE_OPTIONS = [
  { id: 'mixed', label: '混合' },
  { id: 'enToZh', label: '英选中' },
  { id: 'zhToEn', label: '中选英' },
];

const SCOPE_OPTIONS = [
  { id: 'overall', label: '总体复习', note: '多单元混合' },
  { id: 'unit', label: '逐单元学习', note: '当前单元' },
];

const DEFAULT_TYPES = ['word', 'chunkWord', 'sentence'];
const TYPE_ORDER = ['word', 'chunkWord', 'sentence', 'phrase'];

const BASE_ITEMS = [
  ...studyData.items.filter((item) => item.type !== 'phrase'),
  ...LANGUAGE_CHUNK_VOCAB_ITEMS,
  ...LANGUAGE_CHUNK_WORD_ITEMS,
  ...LANGUAGE_CHUNK_ITEMS,
];

const ENRICHED_ITEMS = BASE_ITEMS.map((item) => {
  if (item.type === 'sentence') {
    return {
      ...item,
      meaning: SENTENCE_PATTERN_MEANINGS[item.id] ?? item.meaning,
      exampleTranslation: item.meaning,
    };
  }

  if (item.type === 'word') {
    return {
      ...item,
      exampleTranslation: EXAMPLE_TRANSLATIONS[item.id] ?? '',
    };
  }

  return item;
});

function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

function shuffle(values) {
  const next = [...values];
  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
  }
  return next;
}

function uniqueByText(values) {
  const seen = new Set();
  return values.filter((value) => {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function answerText(item, direction) {
  if (direction === 'translate') {
    return item.example;
  }

  if (direction === 'chunkFill') {
    return item.term;
  }

  if (direction === 'zhToEn') {
    return item.term;
  }
  return item.meaning;
}

function promptText(item, direction) {
  if (direction === 'translate') {
    return item.exampleTranslation ?? item.meaning;
  }

  if (direction === 'chunkFill') {
    return item.blankPrompt ?? item.example ?? item.term;
  }

  return direction === 'zhToEn' ? item.meaning : item.term;
}

function directionLabel(direction) {
  if (direction === 'translate') return '中译英';
  if (direction === 'chunkFill') return '选词填空';
  return direction === 'zhToEn' ? '中选英' : '英选中';
}

function firstLetter(value) {
  return value.trim()[0]?.toLowerCase() ?? '';
}

function pickDirection(mode) {
  if (mode === 'enToZh') return 'enToZh';
  if (mode === 'zhToEn') return 'zhToEn';
  return Math.random() < 0.74 ? 'enToZh' : 'zhToEn';
}

function buildOptions(item, direction, pool) {
  const correct = answerText(item, direction);

  if (direction === 'chunkFill') {
    const correctInitial = firstLetter(correct);
    const scopedSameInitial = pool.filter(
      (candidate) => candidate.type === item.type && candidate.id !== item.id && firstLetter(answerText(candidate, direction)) === correctInitial,
    );
    const globalSameInitial = LANGUAGE_CHUNK_WORD_ITEMS.filter(
      (candidate) => candidate.id !== item.id && firstLetter(answerText(candidate, direction)) === correctInitial,
    );
    const sameInitialTexts = uniqueByText(
      shuffle([...scopedSameInitial, ...globalSameInitial]).map((candidate) => answerText(candidate, direction)),
    ).filter((text) => text !== correct);
    const sameInitialKeys = new Set(sameInitialTexts.map((text) => text.trim().toLowerCase()));
    const supplementalTexts = uniqueByText(
      shuffle([
        ...LANGUAGE_CHUNK_ITEMS.filter(
          (candidate) => candidate.id !== item.id && candidate.blankWord && firstLetter(candidate.blankWord) === correctInitial,
        ).map((candidate) => candidate.blankWord),
        ...ENRICHED_ITEMS.filter(
          (candidate) => candidate.type === 'word' && candidate.id !== item.id && firstLetter(answerText(candidate, direction)) === correctInitial,
        ).map((candidate) => answerText(candidate, direction)),
      ]),
    ).filter((text) => text !== correct && text.trim().toLowerCase() !== correct.trim().toLowerCase() && !sameInitialKeys.has(text.trim().toLowerCase()));

    return shuffle([correct, ...sameInitialTexts, ...supplementalTexts].slice(0, 4));
  }

  const sameType = pool.filter((candidate) => candidate.type === item.type && candidate.id !== item.id);
  const fallback = pool.filter((candidate) => candidate.id !== item.id);
  const sameTypeTexts = uniqueByText(shuffle(sameType).map((candidate) => answerText(candidate, direction))).filter(
    (text) => text !== correct,
  );
  const fallbackTexts = uniqueByText(shuffle(fallback).map((candidate) => answerText(candidate, direction))).filter(
    (text) => text !== correct && !sameTypeTexts.includes(text),
  );
  const distractors = [...sameTypeTexts.slice(0, 3), ...fallbackTexts.slice(0, Math.max(0, 3 - sameTypeTexts.length))];
  return shuffle(uniqueByText([correct, ...distractors.slice(0, 3)]));
}

function scoreForItem(item, progress, focusMode) {
  const record = progress[item.id] ?? {};
  const consecutiveCorrect = record.consecutiveCorrect ?? 0;
  const mastered = record.known || consecutiveCorrect >= MASTERED_STREAK;

  if (mastered && focusMode !== 'weak') return 0.15;

  if (focusMode === 'weak') {
    return (record.wrong ?? 0) * 14 + (record.attempts ? 4 : 0) - consecutiveCorrect * 2;
  }

  if (focusMode === 'bookmarked') {
    return 10 + (record.wrong ?? 0) * 4 - consecutiveCorrect * 1.5;
  }

  if (focusMode === 'new') {
    return record.attempts ? 1 : 20;
  }

  return 9 + (record.wrong ?? 0) * 5 - consecutiveCorrect * 2;
}

function pickItem(pool, progress, focusMode) {
  const weighted = pool.map((item) => ({ item, score: Math.max(0.2, scoreForItem(item, progress, focusMode)) }));
  const total = weighted.reduce((sum, entry) => sum + entry.score, 0);
  let cursor = Math.random() * total;
  for (const entry of weighted) {
    cursor -= entry.score;
    if (cursor <= 0) return entry.item;
  }
  return weighted[0]?.item;
}

function buildQuestion(pool, progress, mode, focusMode, optionPool = pool) {
  if (!pool.length) return null;
  const item = pickItem(pool, progress, focusMode);
  const direction = item.type === 'sentence' ? 'translate' : item.type === 'chunkWord' ? 'chunkFill' : pickDirection(mode);
  return {
    id: `${item.id}-${Date.now()}-${Math.random()}`,
    item,
    direction,
    options: direction === 'translate' ? [] : buildOptions(item, direction, optionPool),
    selected: '',
    revealed: false,
    hint: false,
    draft: '',
  };
}

function formatAccuracy(correct, attempts) {
  if (!attempts) return '0%';
  return `${Math.round((correct / attempts) * 100)}%`;
}

function itemAccuracy(record) {
  if (!record?.attempts) return 0;
  return Math.round(((record.correct ?? 0) / record.attempts) * 100);
}

function normalizeRecord(record = {}) {
  return {
    attempts: record.attempts ?? 0,
    correct: record.correct ?? 0,
    wrong: record.wrong ?? 0,
    consecutiveCorrect: record.consecutiveCorrect ?? 0,
    known: Boolean(record.known),
    bookmarked: Boolean(record.bookmarked),
    bookmarkedAt: record.bookmarkedAt ?? '',
    lastResult: record.lastResult ?? '',
    lastSeenAt: record.lastSeenAt ?? '',
  };
}

function sanitizeProgress(rawProgress, allowedIds) {
  if (!rawProgress || typeof rawProgress !== 'object' || Array.isArray(rawProgress)) {
    return { progress: {}, accepted: 0, rejected: 0 };
  }

  let accepted = 0;
  let rejected = 0;
  const progress = {};

  for (const [id, rawRecord] of Object.entries(rawProgress)) {
    if (!allowedIds.has(id) || !rawRecord || typeof rawRecord !== 'object' || Array.isArray(rawRecord)) {
      rejected += 1;
      continue;
    }

    const attempts = Number(rawRecord.attempts ?? 0);
    const correct = Number(rawRecord.correct ?? 0);
    const wrong = Number(rawRecord.wrong ?? 0);

    if (![attempts, correct, wrong].every(Number.isFinite)) {
      rejected += 1;
      continue;
    }

    progress[id] = {
      attempts: Math.max(0, Math.floor(attempts)),
      correct: Math.max(0, Math.floor(correct)),
      wrong: Math.max(0, Math.floor(wrong)),
      consecutiveCorrect: Math.max(0, Math.floor(Number(rawRecord.consecutiveCorrect ?? 0) || 0)),
      known: Boolean(rawRecord.known),
      bookmarked: Boolean(rawRecord.bookmarked),
      bookmarkedAt: typeof rawRecord.bookmarkedAt === 'string' ? rawRecord.bookmarkedAt : '',
      lastResult: typeof rawRecord.lastResult === 'string' ? rawRecord.lastResult : '',
      lastSeenAt: typeof rawRecord.lastSeenAt === 'string' ? rawRecord.lastSeenAt : '',
    };
    accepted += 1;
  }

  return { progress, accepted, rejected };
}

function mergeProgress(currentProgress, importedProgress) {
  const merged = { ...currentProgress };

  for (const [id, importedRecord] of Object.entries(importedProgress)) {
    const currentRecord = normalizeRecord(merged[id]);
    const nextRecord = normalizeRecord(importedRecord);
    const importedIsNewer = nextRecord.lastSeenAt && nextRecord.lastSeenAt >= currentRecord.lastSeenAt;
    const lastSeenCandidates = [currentRecord.lastSeenAt, nextRecord.lastSeenAt].filter(Boolean).sort();
    const bookmarkCandidates = [currentRecord.bookmarkedAt, nextRecord.bookmarkedAt].filter(Boolean).sort();
    const correct = Math.max(currentRecord.correct, nextRecord.correct);
    const wrong = Math.max(currentRecord.wrong, nextRecord.wrong);

    merged[id] = {
      attempts: Math.max(currentRecord.attempts, nextRecord.attempts, correct + wrong),
      correct,
      wrong,
      consecutiveCorrect: Math.max(currentRecord.consecutiveCorrect, nextRecord.consecutiveCorrect),
      known: currentRecord.known || nextRecord.known,
      bookmarked: currentRecord.bookmarked || nextRecord.bookmarked,
      bookmarkedAt: bookmarkCandidates[bookmarkCandidates.length - 1] ?? '',
      lastResult: importedIsNewer ? nextRecord.lastResult : currentRecord.lastResult,
      lastSeenAt: lastSeenCandidates[lastSeenCandidates.length - 1] ?? '',
    };
  }

  return merged;
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function UnitButton({ unit, count, selected, onClick }) {
  return (
    <button className={`unit-button ${selected ? 'selected' : ''}`} onClick={onClick} type="button">
      <span>
        Unit {unit.id}
        <small>{unit.titleZh}</small>
      </span>
      <b>{count}</b>
    </button>
  );
}

function ScopeButton({ option, selected, onClick }) {
  return (
    <button className={`scope-button ${selected ? 'selected' : ''}`} onClick={onClick} type="button">
      <b>{option.label}</b>
      <span>{option.note}</span>
    </button>
  );
}

function StatCard({ icon, label, value }) {
  return (
    <div className="stat-card">
      {icon}
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function App() {
  const units = studyData.units;
  const allItems = ENRICHED_ITEMS;
  const fileInputRef = useRef(null);
  const [studyScope, setStudyScope] = useState('overall');
  const [activeUnit, setActiveUnit] = useState(units[0]?.id ?? 1);
  const [selectedUnits, setSelectedUnits] = useState(() => new Set(units.map((unit) => unit.id)));
  const [selectedTypes, setSelectedTypes] = useState(() => new Set(DEFAULT_TYPES));
  const [mode, setMode] = useState('mixed');
  const [focusMode, setFocusMode] = useState('all');
  const [progress, setProgress] = useState(loadProgress);
  const progressRef = useRef(progress);
  const [session, setSession] = useState({ attempts: 0, correct: 0, streak: 0 });
  const [question, setQuestion] = useState(null);
  const [notebookExpanded, setNotebookExpanded] = useState(false);
  const [syncMessage, setSyncMessage] = useState('本机自动保存');

  useEffect(() => {
    saveProgress(progress);
    progressRef.current = progress;
  }, [progress]);

  const scopeUnitIds = useMemo(() => {
    return studyScope === 'unit' ? new Set([activeUnit]) : selectedUnits;
  }, [activeUnit, selectedUnits, studyScope]);

  const activeUnitIndex = useMemo(() => units.findIndex((unit) => unit.id === activeUnit), [activeUnit, units]);
  const activeUnitInfo = units[activeUnitIndex] ?? units[0];

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => scopeUnitIds.has(item.unit) && selectedTypes.has(item.type));
  }, [allItems, scopeUnitIds, selectedTypes]);

  const studiedCount = useMemo(
    () => filteredItems.filter((item) => (progress[item.id]?.attempts ?? 0) > 0).length,
    [filteredItems, progress],
  );

  const unitCounts = useMemo(() => {
    const counts = new Map(units.map((unit) => [unit.id, 0]));
    for (const item of allItems) {
      if (selectedTypes.has(item.type)) counts.set(item.unit, (counts.get(item.unit) ?? 0) + 1);
    }
    return counts;
  }, [allItems, selectedTypes, units]);

  const typeCounts = useMemo(() => {
    return TYPE_ORDER.reduce((counts, type) => {
      counts[type] = allItems.filter((item) => item.type === type).length;
      return counts;
    }, {});
  }, [allItems]);

  const weakItems = useMemo(() => {
    return allItems
      .map((item) => ({ item, record: normalizeRecord(progress[item.id]) }))
      .filter(({ record }) => record.wrong > 0 || (record.attempts >= 2 && record.consecutiveCorrect < MASTERED_STREAK))
      .sort((a, b) => b.record.wrong - a.record.wrong || a.record.consecutiveCorrect - b.record.consecutiveCorrect)
      .slice(0, 9);
  }, [allItems, progress]);

  const visibleWeakItems = useMemo(() => {
    if (studyScope !== 'unit') return weakItems;

    return allItems
      .filter((item) => item.unit === activeUnit)
      .map((item) => ({ item, record: normalizeRecord(progress[item.id]) }))
      .filter(({ record }) => record.wrong > 0 || (record.attempts >= 2 && record.consecutiveCorrect < MASTERED_STREAK))
      .sort((a, b) => b.record.wrong - a.record.wrong || a.record.consecutiveCorrect - b.record.consecutiveCorrect)
      .slice(0, 9);
  }, [activeUnit, allItems, progress, studyScope, weakItems]);

  const visibleWeakPool = useMemo(
    () => visibleWeakItems.map(({ item }) => item).filter((item) => scopeUnitIds.has(item.unit) && selectedTypes.has(item.type)),
    [scopeUnitIds, selectedTypes, visibleWeakItems],
  );

  const bookmarkedItems = useMemo(() => {
    return allItems
      .map((item) => ({ item, record: normalizeRecord(progress[item.id]) }))
      .filter(({ item, record }) => record.bookmarked && scopeUnitIds.has(item.unit))
      .sort((a, b) => {
        const timeCompare = (b.record.bookmarkedAt || '').localeCompare(a.record.bookmarkedAt || '');
        return timeCompare || a.item.unit - b.item.unit || a.item.term.localeCompare(b.item.term);
      });
  }, [allItems, progress, scopeUnitIds]);

  const bookmarkedPool = useMemo(() => bookmarkedItems.map(({ item }) => item), [bookmarkedItems]);

  const practicePool = useMemo(() => {
    if (focusMode === 'bookmarked') return bookmarkedPool.length ? bookmarkedPool : filteredItems;
    if (focusMode === 'weak') return visibleWeakPool.length ? visibleWeakPool : filteredItems;
    return filteredItems;
  }, [bookmarkedPool, filteredItems, focusMode, visibleWeakPool]);

  const optionPool = focusMode === 'bookmarked' || focusMode === 'weak' ? allItems : filteredItems;

  const knownCount = useMemo(
    () =>
      filteredItems.filter((item) => {
        const record = progress[item.id];
        return record?.known || (record?.consecutiveCorrect ?? 0) >= MASTERED_STREAK;
      }).length,
    [filteredItems, progress],
  );
  const allowedItemIds = useMemo(() => new Set(allItems.map((item) => item.id)), [allItems]);

  useEffect(() => {
    setQuestion(buildQuestion(practicePool, progress, mode, focusMode, optionPool));
  }, [focusMode, mode, optionPool, practicePool]);

  const currentAnswer = question ? answerText(question.item, question.direction) : '';
  const isAnswered = Boolean(question?.selected);
  const isTranslationQuestion = question?.direction === 'translate';
  const isChunkFillQuestion = question?.direction === 'chunkFill';
  const isCorrect = isAnswered && (isTranslationQuestion ? question.selected === 'self-correct' : question.selected === currentAnswer);

  function nextQuestion(nextFocusMode = focusMode) {
    const nextPool =
      nextFocusMode === 'bookmarked'
        ? bookmarkedPool.length
          ? bookmarkedPool
          : filteredItems
        : nextFocusMode === 'weak'
          ? visibleWeakPool.length
            ? visibleWeakPool
            : filteredItems
          : filteredItems;
    const nextOptionPool = nextFocusMode === 'bookmarked' || nextFocusMode === 'weak' ? allItems : filteredItems;
    setQuestion(buildQuestion(nextPool, progress, mode, nextFocusMode, nextOptionPool));
  }

  function moveActiveUnit(step) {
    if (!units.length) return;
    const currentIndex = activeUnitIndex >= 0 ? activeUnitIndex : 0;
    const nextIndex = (currentIndex + step + units.length) % units.length;
    setStudyScope('unit');
    setActiveUnit(units[nextIndex].id);
  }

  function recordResult(item, correct) {
    setSession((current) => ({
      attempts: current.attempts + 1,
      correct: current.correct + (correct ? 1 : 0),
      streak: correct ? current.streak + 1 : 0,
    }));
    setProgress((current) => {
      const oldRecord = normalizeRecord(current[item.id]);
      const nextRecord = {
        ...oldRecord,
        attempts: oldRecord.attempts + 1,
        correct: oldRecord.correct + (correct ? 1 : 0),
        wrong: oldRecord.wrong + (correct ? 0 : 1),
        consecutiveCorrect: correct ? oldRecord.consecutiveCorrect + 1 : 0,
        known: oldRecord.known || (correct && oldRecord.consecutiveCorrect + 1 >= MASTERED_STREAK),
        lastResult: correct ? 'correct' : 'wrong',
        lastSeenAt: new Date().toISOString(),
      };
      const nextProgress = {
        ...current,
        [item.id]: nextRecord,
      };
      progressRef.current = nextProgress;
      return nextProgress;
    });
  }

  function autoAdvanceAfterCorrect(answeredId) {
    window.setTimeout(() => {
      setQuestion((current) => {
        if (!current || current.id !== answeredId) return current;
        const nextPool =
          focusMode === 'bookmarked'
            ? bookmarkedPool.length
              ? bookmarkedPool
              : filteredItems
            : focusMode === 'weak'
              ? visibleWeakPool.length
                ? visibleWeakPool
                : filteredItems
              : filteredItems;
        const nextOptionPool = focusMode === 'bookmarked' || focusMode === 'weak' ? allItems : filteredItems;
        return buildQuestion(nextPool, progressRef.current, mode, focusMode, nextOptionPool);
      });
    }, CORRECT_AUTO_NEXT_MS);
  }

  function answer(option) {
    if (!question || question.selected || isTranslationQuestion) return;
    const correct = option === currentAnswer;
    setQuestion((current) => ({ ...current, selected: option, revealed: true }));
    recordResult(question.item, correct);

    if (correct) {
      autoAdvanceAfterCorrect(question.id);
    }
  }

  function revealTranslation() {
    if (!question || !isTranslationQuestion || question.revealed) return;
    setQuestion((current) => ({ ...current, revealed: true }));
  }

  function updateTranslationDraft(value) {
    if (!question || !isTranslationQuestion || question.revealed) return;
    setQuestion((current) => ({ ...current, draft: value }));
  }

  function gradeTranslation(correct) {
    if (!question || !isTranslationQuestion || question.selected) return;
    setQuestion((current) => ({ ...current, selected: correct ? 'self-correct' : 'self-wrong', revealed: true }));
    recordResult(question.item, correct);

    if (correct) {
      autoAdvanceAfterCorrect(question.id);
    }
  }

  function buildDirectQuestion(item, nextFocusMode = focusMode) {
    const direction = item.type === 'sentence' ? 'translate' : item.type === 'chunkWord' ? 'chunkFill' : pickDirection(mode);
    const nextOptionPool = nextFocusMode === 'bookmarked' || nextFocusMode === 'weak' ? allItems : filteredItems;
    return {
      id: `${item.id}-${Date.now()}`,
      item,
      direction,
      options: direction === 'translate' ? [] : buildOptions(item, direction, nextOptionPool),
      selected: '',
      revealed: false,
      hint: false,
      draft: '',
    };
  }

  function toggleUnit(unitId) {
    if (studyScope === 'unit') {
      setActiveUnit(unitId);
      return;
    }

    setSelectedUnits((current) => {
      const next = new Set(current);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next.size ? next : current;
    });
  }

  function selectAllUnits() {
    setSelectedUnits(new Set(units.map((unit) => unit.id)));
  }

  function returnToOverallReview() {
    selectAllUnits();
    setStudyScope('overall');
  }

  function toggleType(type) {
    setSelectedTypes((current) => {
      const next = new Set(current);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next.size ? next : current;
    });
  }

  function markKnown() {
    if (!question) return;
    setProgress((current) => {
      const oldRecord = normalizeRecord(current[question.item.id]);
      return {
        ...current,
        [question.item.id]: {
          ...oldRecord,
          known: !oldRecord.known,
          consecutiveCorrect: oldRecord.known ? 0 : MASTERED_STREAK,
          lastSeenAt: new Date().toISOString(),
        },
      };
    });
  }

  function toggleBookmark() {
    if (!question) return;
    const nextBookmarked = !currentRecord.bookmarked;
    setProgress((current) => {
      const oldRecord = normalizeRecord(current[question.item.id]);
      return {
        ...current,
        [question.item.id]: {
          ...oldRecord,
          bookmarked: nextBookmarked,
          bookmarkedAt: nextBookmarked ? new Date().toISOString() : '',
          lastSeenAt: new Date().toISOString(),
        },
      };
    });
    setSyncMessage(nextBookmarked ? '已加入生词本' : '已移出生词本');
  }

  function resetProgress() {
    setProgress({});
    setSession({ attempts: 0, correct: 0, streak: 0 });
    setSyncMessage('进度已重置');
    setQuestion(buildQuestion(filteredItems, {}, mode, focusMode));
  }

  function startWeakReview() {
    setFocusMode('weak');
    setQuestion(buildQuestion(visibleWeakPool.length ? visibleWeakPool : filteredItems, progress, mode, 'weak', allItems));
  }

  function startBookmarkedReview() {
    if (!bookmarkedPool.length) {
      setSyncMessage('生词本暂无内容');
      return;
    }

    setFocusMode('bookmarked');
    setQuestion(buildQuestion(bookmarkedPool, progress, mode, 'bookmarked', allItems));
  }

  function exportProgress() {
    const exportedAt = new Date().toISOString();
    const dateLabel = exportedAt.slice(0, 10);
    downloadJson(`医学人文英语复习进度_${dateLabel}.json`, {
      app: '医学人文英语复习小程序',
      version: EXPORT_VERSION,
      storageKey: STORAGE_KEY,
      exportedAt,
      itemCount: allItems.length,
      progress,
    });
    setSyncMessage(`已导出 ${Object.keys(progress).length} 条进度`);
  }

  async function importProgress(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const rawText = await file.text();
      const payload = JSON.parse(rawText);
      if (payload.version && payload.version < EXPORT_VERSION) {
        setSyncMessage('导入失败：旧版进度对应旧词组题库，请先使用新版重新练习并导出');
        return;
      }
      const rawProgress = payload.progress ?? payload;
      const { progress: incomingProgress, accepted, rejected } = sanitizeProgress(rawProgress, allowedItemIds);

      if (!accepted) {
        setSyncMessage('导入失败：没有识别到本题库进度');
        return;
      }

      setProgress((current) => mergeProgress(current, incomingProgress));
      setSyncMessage(`已导入 ${accepted} 条进度${rejected ? `，跳过 ${rejected} 条` : ''}`);
    } catch {
      setSyncMessage('导入失败：文件不是有效进度 JSON');
    }
  }

  const currentRecord = question ? normalizeRecord(progress[question.item.id]) : {};
  const prompt = question ? promptText(question.item, question.direction) : '';

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <BookOpen size={24} aria-hidden="true" />
          </div>
          <div>
            <h1>医研英语</h1>
            <p>考试抽查复习</p>
          </div>
        </div>

        <section className="side-section">
          <div className="section-title">
            <span>学习范围</span>
            <BookOpen size={16} aria-hidden="true" />
          </div>
          <div className="scope-toggle">
            {SCOPE_OPTIONS.map((option) => (
              <ScopeButton
                key={option.id}
                option={option}
                selected={studyScope === option.id}
                onClick={() => setStudyScope(option.id)}
              />
            ))}
          </div>
        </section>

        <section className="side-section">
          <div className="section-title">
            <span>{studyScope === 'unit' ? '当前单元' : '学习单元'}</span>
            {studyScope === 'overall' ? (
              <button className="icon-button" onClick={selectAllUnits} type="button" aria-label="选择全部单元">
                <Check size={16} />
              </button>
            ) : (
              <span className="scope-note">单选</span>
            )}
          </div>
          {studyScope === 'unit' ? (
            <div className="unit-stepper">
              <button onClick={() => moveActiveUnit(-1)} type="button">
                <ChevronLeft size={16} />
              </button>
              <strong>
                Unit {activeUnitInfo?.id}
                <small>{unitCounts.get(activeUnitInfo?.id) ?? 0} 题</small>
              </strong>
              <button onClick={() => moveActiveUnit(1)} type="button">
                <ChevronRight size={16} />
              </button>
            </div>
          ) : null}
          <div className="unit-list">
            {units.map((unit) => (
              <UnitButton
                key={unit.id}
                unit={unit}
                count={unitCounts.get(unit.id)}
                selected={studyScope === 'unit' ? activeUnit === unit.id : selectedUnits.has(unit.id)}
                onClick={() => toggleUnit(unit.id)}
              />
            ))}
          </div>
        </section>

        <section className="side-section">
          <div className="section-title">
            <span>复习档位</span>
            <Filter size={16} aria-hidden="true" />
          </div>
          <div className="type-grid">
            {TYPE_ORDER.map((type) => (
              <button
                key={type}
                className={`type-toggle ${TYPE_META[type].className} ${selectedTypes.has(type) ? 'selected' : ''}`}
                onClick={() => toggleType(type)}
                type="button"
              >
                <span>{TYPE_META[type].short}</span>
                <b>{TYPE_META[type].label}</b>
                <small>{typeCounts[type]}</small>
              </button>
            ))}
          </div>
        </section>

        <section className="side-section">
          <div className="section-title">
            <span>抽查模式</span>
            <Shuffle size={16} aria-hidden="true" />
          </div>
          <div className="mode-stack">
            {MODE_OPTIONS.map((option) => (
              <button
                className={`mode-button ${mode === option.id ? 'selected' : ''}`}
                key={option.id}
                onClick={() => setMode(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className="main-stage">
        <header className="topbar">
          <div className="progress-cluster">
            <span>学习进度</span>
            <strong>
              {studiedCount}
              <small> / {filteredItems.length}</small>
            </strong>
          </div>
          <div className="progress-track" aria-label="学习进度">
            <span style={{ width: `${filteredItems.length ? Math.min(100, (studiedCount / filteredItems.length) * 100) : 0}%` }} />
          </div>
          <div className="topbar-meta">
            <span>{studyScope === 'unit' ? `逐单元 · Unit ${activeUnitInfo?.id}` : '总体复习'}</span>
            <span>本组 {filteredItems.length}</span>
            <span>已掌握 {knownCount}</span>
            <button className="icon-button" type="button" aria-label="设置">
              <Settings size={18} />
            </button>
          </div>
        </header>

        <section className="quiz-panel">
          {question ? (
            <>
              <div className="quiz-head">
                <span className={`type-chip ${TYPE_META[question.item.type].className}`}>
                  {TYPE_META[question.item.type].label}
                </span>
                <span>{directionLabel(question.direction)}</span>
                <span>{question.item.source}</span>
                <span>
                  {currentRecord.attempts
                    ? `历史正确率 ${itemAccuracy(currentRecord)}% · 连对 ${currentRecord.consecutiveCorrect}/${MASTERED_STREAK}`
                    : '首次出现'}
                </span>
                {question.item.sourceNote ? <span>{question.item.sourceNote}</span> : null}
              </div>

              <div className={`prompt-card ${question.item.type === 'sentence' ? 'sentence-prompt translation-prompt' : ''}`}>
                <div className="prompt-index">
                  <span>{session.attempts + 1}</span>
                </div>
                <h2>{prompt}</h2>
                {isTranslationQuestion ? (
                  <div className="example-line structure-line">
                    <strong>要求句式</strong>
                    <p>{question.item.term}</p>
                  </div>
                ) : null}
                {isChunkFillQuestion ? (
                  <div className="example-line chunk-fill-line">
                    <strong>中文提示</strong>
                    <p>{question.item.meaning}</p>
                    <small>首字母：{question.item.blankInitial}</small>
                  </div>
                ) : null}
                {question.direction === 'enToZh' && question.item.example ? (
                  <div className="example-line">
                    <p>{question.item.example}</p>
                    {question.item.exampleTranslation ? <small>{question.item.exampleTranslation}</small> : null}
                  </div>
                ) : null}
                {isTranslationQuestion ? (
                  <textarea
                    className="translation-input"
                    disabled={question.revealed}
                    onChange={(event) => updateTranslationDraft(event.target.value)}
                    placeholder="英文译文"
                    value={question.draft}
                  />
                ) : null}
                {question.hint ? (
                  <div className="hint-box">
                    <CircleHelp size={17} aria-hidden="true" />
                    <span>{question.item.tags.join(' · ')}</span>
                  </div>
                ) : null}
              </div>

              {!isTranslationQuestion ? (
                <div className="option-list">
                  {question.options.map((option, index) => {
                    const correctOption = isAnswered && option === currentAnswer;
                    const wrongOption = isAnswered && question.selected === option && option !== currentAnswer;
                    return (
                      <button
                        className={`answer-option ${correctOption ? 'correct' : ''} ${wrongOption ? 'wrong' : ''}`}
                        disabled={isAnswered}
                        key={option}
                        onClick={() => answer(option)}
                        type="button"
                      >
                        <span>{String.fromCharCode(65 + index)}</span>
                        <b>{option}</b>
                        {correctOption ? <Check size={20} aria-hidden="true" /> : null}
                        {wrongOption ? <X size={20} aria-hidden="true" /> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {isAnswered || (isTranslationQuestion && question.revealed) ? (
                <div className={`answer-sheet ${isTranslationQuestion && !isAnswered ? 'neutral' : isCorrect ? 'correct' : 'wrong'}`}>
                  <strong>{isTranslationQuestion && !isAnswered ? '参考译文' : isCorrect ? '答对了' : '正确答案'}</strong>
                  <p>{currentAnswer}</p>
                  <small>
                    {question.item.type === 'sentence'
                      ? `要求句式：${question.item.term}`
                      : question.item.type === 'chunkWord'
                        ? `完整搭配：${question.item.example} · ${question.item.meaning}`
                      : `${question.item.term}：${question.item.meaning}`}
                  </small>
                </div>
              ) : null}

              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() => setQuestion((current) => ({ ...current, hint: !current.hint }))}
                  type="button"
                >
                  <Eye size={18} />
                  显示提示
                </button>
                <button className="secondary-button" onClick={markKnown} type="button">
                  <Check size={18} />
                  {currentRecord.known ? '取消掌握' : '标记掌握'}
                </button>
                <button
                  className={`secondary-button ${currentRecord.bookmarked ? 'bookmarked-button' : ''}`}
                  onClick={toggleBookmark}
                  type="button"
                >
                  <Bookmark size={18} />
                  {currentRecord.bookmarked ? '移出生词本' : '加入生词本'}
                </button>
                {isTranslationQuestion && !question.revealed ? (
                  <button className="primary-button" onClick={revealTranslation} type="button">
                    参考译文
                    <ChevronRight size={20} />
                  </button>
                ) : isTranslationQuestion && question.revealed && !isAnswered ? (
                  <div className="translation-grade">
                    <button className="secondary-button" onClick={() => gradeTranslation(false)} type="button">
                      <X size={18} />
                      还不会
                    </button>
                    <button className="primary-button" onClick={() => gradeTranslation(true)} type="button">
                      <Check size={18} />
                      答对了
                    </button>
                  </div>
                ) : (
                  <button className="primary-button" onClick={() => nextQuestion()} type="button">
                    {isAnswered && !isCorrect ? '下一题' : '跳过'}
                    <ChevronRight size={20} />
                  </button>
                )}
              </div>
            </>
          ) : (
            <div className="empty-state">
              <BookOpen size={44} aria-hidden="true" />
              <h2>当前筛选没有题目</h2>
              <button className="primary-button" onClick={studyScope === 'unit' ? returnToOverallReview : selectAllUnits} type="button">
                {studyScope === 'unit' ? '返回总体复习' : '选择全部单元'}
              </button>
            </div>
          )}
        </section>

        <section className="recall-strip">
          <div>
            <span>当前反向抽查</span>
            <strong>
              {question?.direction === 'translate'
                ? '中文原句 → 英文译文'
                : question?.direction === 'chunkFill'
                  ? '英文挖空 → 选词'
                : question?.direction === 'zhToEn'
                  ? '中文释义 → 英文'
                  : '英文 → 中文释义'}
            </strong>
          </div>
          <button className="secondary-button compact" onClick={() => setMode(mode === 'zhToEn' ? 'mixed' : 'zhToEn')} type="button">
            切换中选英
          </button>
        </section>
      </main>

      <aside className="insights">
        <section className="overview-card">
          <div className="panel-heading">
            <h2>今日概览</h2>
            <button className="text-button" onClick={resetProgress} type="button">
              <RotateCcw size={16} />
              重置
            </button>
          </div>
          <div className="stats-grid">
            <StatCard icon={<Target size={22} />} label="连续正确" value={session.streak} />
            <StatCard icon={<BarChart3 size={22} />} label="本次正确率" value={formatAccuracy(session.correct, session.attempts)} />
            <StatCard icon={<BookOpen size={22} />} label="已练题数" value={session.attempts} />
          </div>
          <div className="mini-bars" aria-label="题库组成">
            {TYPE_ORDER.map((type) => (
              <div key={type}>
                <span>{TYPE_META[type].label}</span>
                <b style={{ height: `${Math.max(18, (typeCounts[type] / allItems.length) * 120)}px` }} />
                <strong>{typeCounts[type]}</strong>
              </div>
            ))}
          </div>
        </section>

        <section className="sync-card">
          <div className="panel-heading">
            <h2>进度同步</h2>
            <span className="sync-status">{syncMessage}</span>
          </div>
          <div className="sync-actions">
            <button className="secondary-button sync-button" onClick={exportProgress} type="button">
              <Download size={17} />
              导出进度
            </button>
            <button className="secondary-button sync-button" onClick={() => fileInputRef.current?.click()} type="button">
              <Upload size={17} />
              导入进度
            </button>
          </div>
          <input
            ref={fileInputRef}
            accept="application/json,.json"
            className="hidden-file"
            onChange={importProgress}
            type="file"
          />
          <p className="sync-note">导入会合并进度，保留已掌握标记和较高练习次数。</p>
        </section>

        <section className="notebook-card">
          <div className="panel-heading">
            <h2>生词本</h2>
            {bookmarkedItems.length ? (
              <span className="notebook-count">{notebookExpanded ? '已展开' : '预览'}</span>
            ) : null}
          </div>
          <div className="notebook-summary">
            <strong>{bookmarkedItems.length}</strong>
            <span>{studyScope === 'unit' ? `当前 Unit ${activeUnitInfo?.id}` : '当前范围'} 已加入</span>
          </div>
          {bookmarkedItems.length ? (
            <div className="notebook-actions">
              <button className="primary-button notebook-practice" onClick={startBookmarkedReview} type="button">
                练习生词本
              </button>
              <button
                className="secondary-button notebook-expand"
                onClick={() => setNotebookExpanded((current) => !current)}
                type="button"
              >
                {notebookExpanded ? '收起' : '展开全部'}
              </button>
            </div>
          ) : null}
          <div className={`weak-list notebook-list ${notebookExpanded ? 'expanded' : ''}`}>
            {bookmarkedItems.length ? (
              (notebookExpanded ? bookmarkedItems : bookmarkedItems.slice(0, 8)).map(({ item, record }) => (
                <button
                  className="weak-item"
                  key={item.id}
                  onClick={() => {
                    setFocusMode('bookmarked');
                    setQuestion(buildDirectQuestion(item, 'bookmarked'));
                  }}
                  type="button"
                >
                  <span className={`dot ${TYPE_META[item.type].className}`} />
                  <b>{item.term}</b>
                  <small>
                    Unit {item.unit} · {record.attempts ? `练 ${record.attempts}` : '未练'}
                  </small>
                  {notebookExpanded ? <em>{item.meaning}</em> : null}
                </button>
              ))
            ) : (
              <p className="subtle">当前范围暂无生词</p>
            )}
          </div>
        </section>

        <section className="weak-card">
          <div className="panel-heading">
            <h2>薄弱项</h2>
            <button className="text-button" onClick={startWeakReview} type="button">
              开始复习
            </button>
          </div>
          <div className="weak-list">
            {visibleWeakItems.length ? (
              visibleWeakItems.map(({ item, record }) => (
                <button
                  className="weak-item"
                  key={item.id}
                  onClick={() => {
                    setFocusMode('weak');
                    setQuestion(buildDirectQuestion(item, 'weak'));
                  }}
                  type="button"
                >
                  <span className={`dot ${TYPE_META[item.type].className}`} />
                  <b>{item.term}</b>
                  <small>
                    Unit {item.unit} · 错 {record.wrong}
                  </small>
                </button>
              ))
            ) : (
              <p className="subtle">暂无错题</p>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

export default App;
