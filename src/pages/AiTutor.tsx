import { useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { useEffect, useRef, useState, type ClipboardEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Page } from '../components/Layout';
import { MathText } from '../components/MathText';
import { toast } from '../components/Toast';
import { Button, Card, Loading } from '../components/ui';
import { api, ApiError, errorText, mediaUrl } from '../lib/api';
import { useT } from '../lib/i18n';
import { encodeImage, IMAGE_ACCEPT, imageFromClipboard, pickImage } from '../lib/image';
import { confirmDialog, haptic, openTelegramLink } from '../lib/telegram';
import { hasRole, useAuth } from '../store/auth';

export interface AiStatus {
  configured: boolean;
  enabled: boolean;
  limit: number | null;
  used: number;
  busy: boolean;
  practice: { limit: number | null; used: number };
}

interface AiMsg {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  channel: string;
  createdAt: string;
  context: { kind: 'question' | 'lesson'; title: string | null; skillId: string | null } | null;
  imageUrl: string | null;
  /** Javob kutilayotgan vaqtinchalik xabar */
  pending?: boolean;
}

type ChatResp = { messages: AiMsg[]; state: AiStatus };

/** AI javobidagi "- " ro'yxatlarni chiroyli nuqtaga aylantiramiz (MathText **qalin** va $formula$ ni o'zi chizadi). */
const pretty = (s: string) => s.replace(/^[-*] /gm, '• ');

function Bubble({ m }: { m: AiMsg }) {
  const mine = m.role === 'user';
  return (
    <div className={clsx('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={clsx(
          'max-w-[88%] rounded-2xl px-3.5 py-2.5 text-[15px] leading-relaxed',
          mine ? 'rounded-br-md bg-accent text-accent-text' : 'rounded-bl-md bg-card shadow-[0_1px_2px_rgba(0,0,0,0.05)]',
          m.pending && 'opacity-70',
        )}
      >
        {m.context?.title && (
          <div className={clsx('mb-1 text-xs font-semibold', mine ? 'opacity-80' : 'text-hint')}>
            {m.context.kind === 'lesson' ? '📚' : '📎'} {m.context.title}
          </div>
        )}
        {m.imageUrl && <img src={mediaUrl(m.imageUrl)} alt="" className="mb-1.5 max-h-56 rounded-xl object-contain" />}
        {mine ? <div className="whitespace-pre-wrap break-words">{m.content}</div> : <MathText text={pretty(m.content)} className="break-words" />}
        {m.channel === 'bot' && !mine && <div className="mt-1 text-[10px] text-hint">Telegram</div>}
      </div>
    </div>
  );
}

function Typing() {
  const t = useT();
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-md bg-card px-3.5 py-2.5 text-sm text-hint">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-hint" style={{ animationDelay: `${i * 0.15}s` }} />
          ))}
        </span>
        {t('ai.thinking')}
      </div>
    </div>
  );
}

export default function AiTutor() {
  const t = useT();
  const qc = useQueryClient();
  const bot = useAuth((s) => s.config.botUsername);
  const isOperator = hasRole(useAuth((s) => s.user), 'OPERATOR');
  const [params, setParams] = useSearchParams();
  const status = useQuery({ queryKey: ['ai-status'], queryFn: () => api<AiStatus>('/ai/status') });
  const history = useQuery({ queryKey: ['ai-chat'], queryFn: () => api<{ messages: AiMsg[] }>('/ai/chat') });

  const [msgs, setMsgs] = useState<AiMsg[]>([]);
  const [text, setText] = useState('');
  const [image, setImage] = useState<{ mime: string; data: string; url: string } | null>(null);
  const [answerId, setAnswerId] = useState<string | null>(params.get('answer'));
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const lessonStarted = useRef(false);

  useEffect(() => {
    if (history.data) setMsgs(history.data.messages);
  }, [history.data]);

  // Savol bo'yicha ochilganda — tayyor savol matni
  useEffect(() => {
    if (params.get('answer')) setText((v) => v || t('ai.askQuestionDefault'));
    // faqat birinchi ochilishda
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Yangi xabar — sahifa oxiriga (yozish maydoni xabarlardan keyin turadi, oxirgi javob uning ortida qolmasin)
  useEffect(() => {
    const id = window.setTimeout(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'smooth' }), 50);
    return () => window.clearTimeout(id);
  }, [msgs.length, busy]);

  const st = status.data;
  const limitReached = !!st && st.limit !== null && st.used >= st.limit;
  const canSend = !!st?.enabled && !st.busy && !limitReached && !busy;

  const onResult = (r: ChatResp, tempId: string) => {
    setMsgs((list) => [...list.filter((m) => m.id !== tempId), ...r.messages]);
    qc.setQueryData(['ai-status'], (old: AiStatus | undefined) => (old ? { ...old, ...r.state } : r.state));
    void qc.invalidateQueries({ queryKey: ['ai-chat'] });
    haptic('light');
  };

  const onFail = (e: unknown, tempId: string) => {
    setMsgs((list) => list.filter((m) => m.id !== tempId));
    toast(errorText(e), { kind: 'error' });
    if (e instanceof ApiError && ['AI_LIMIT', 'AI_BUSY', 'AI_OFF', 'AI_DISABLED'].includes(e.code ?? '')) void status.refetch();
  };

  // Xatolar daftaridan «Tushuntir»: mavzu darsi
  useEffect(() => {
    const skillId = params.get('lesson');
    if (!skillId || !st?.enabled || lessonStarted.current || history.isLoading) return;
    lessonStarted.current = true;
    const tempId = `tmp-${Date.now()}`;
    setMsgs((list) => [
      ...list,
      { id: tempId, role: 'user', content: t('ai.lessonAsk'), channel: 'app', createdAt: new Date().toISOString(), context: null, imageUrl: null, pending: true },
    ]);
    setBusy(true);
    api<ChatResp>('/ai/lesson', { body: { skillId } })
      .then((r) => onResult(r, tempId))
      .catch((e) => onFail(e, tempId))
      .finally(() => {
        setBusy(false);
        params.delete('lesson');
        setParams(params, { replace: true });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st?.enabled, history.isLoading]);

  const send = async () => {
    const body = text.trim();
    if ((!body && !image) || !canSend) return;
    const tempId = `tmp-${Date.now()}`;
    setMsgs((list) => [
      ...list,
      {
        id: tempId,
        role: 'user',
        content: body || '📷',
        channel: 'app',
        createdAt: new Date().toISOString(),
        context: answerId ? { kind: 'question', title: t('ai.aboutQuestion'), skillId: null } : null,
        imageUrl: image?.url ?? null,
        pending: true,
      },
    ]);
    const payload = { text: body, image: image ? { mime: image.mime, data: image.data } : null, answerId };
    setText('');
    setImage(null);
    setBusy(true);
    try {
      const r = await api<ChatResp>('/ai/chat', { body: payload });
      onResult(r, tempId);
      if (answerId) {
        setAnswerId(null);
        params.delete('answer');
        setParams(params, { replace: true });
      }
    } catch (e) {
      onFail(e, tempId);
      setText(body);
    } finally {
      setBusy(false);
    }
  };

  const attach = async (file: File | null | undefined) => {
    if (!file) return;
    try {
      const picked = await pickImage(file);
      const enc = encodeImage(picked, { maxEdge: 1600, maxBytes: 1_500_000 });
      setImage({ mime: enc.mime, data: enc.data, url: `data:${enc.mime};base64,${enc.data}` });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  };

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const f = imageFromClipboard(e.nativeEvent);
    if (f) {
      e.preventDefault();
      void attach(f);
    }
  };

  const newChat = async () => {
    if (!(await confirmDialog(t('ai.newChatConfirm')))) return;
    try {
      await api('/ai/chat', { method: 'DELETE' });
      setMsgs([]);
      void qc.invalidateQueries({ queryKey: ['ai-chat'] });
    } catch (e) {
      toast(errorText(e), { kind: 'error' });
    }
  };

  if (status.isLoading || history.isLoading) return <Loading />;

  return (
    <Page
      title={`🤖 ${t('ai.title')}`}
      actions={
        <div className="flex gap-1.5">
          {bot && (
            <button onClick={() => openTelegramLink(`https://t.me/${bot}`)} className="rounded-full bg-soft px-3 py-1 text-sm text-hint" title={t('ai.inBot')}>
              ✈️ Bot
            </button>
          )}
          {msgs.length > 0 && (
            <button onClick={() => void newChat()} className="rounded-full bg-soft px-3 py-1 text-sm text-hint">
              🆕 {t('ai.newChat')}
            </button>
          )}
        </div>
      }
    >
      {!st?.configured ? (
        <Card className="text-sm">
          {t('ai.disabled')}
          {isOperator && (
            <div className="mt-2 text-xs text-hint">
              Admin: Railway → sat-backend → Variables → <code>ANTHROPIC_API_KEY</code>. Batafsil: Panel → 🤖 AI savol generatori.
            </div>
          )}
        </Card>
      ) : !st.enabled ? (
        <Card className="text-sm">{t('ai.off')}</Card>
      ) : null}

      {msgs.length === 0 && st?.enabled && (
        <Card className="mb-3">
          <p className="mb-3 text-sm text-hint">{t('ai.subtitle')}</p>
          <div className="mb-2 text-xs font-semibold uppercase text-hint">{t('ai.examples')}</div>
          <div className="flex flex-col gap-2">
            {[t('ai.example1'), t('ai.example2'), t('ai.example3')].map((ex) => (
              <button key={ex} onClick={() => setText(ex)} className="rounded-xl bg-soft px-3 py-2 text-left text-sm active:scale-[0.99]">
                {ex}
              </button>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-col gap-2.5 pb-2">
        {msgs.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        {busy && <Typing />}
        <div ref={endRef} />
      </div>

      {st?.enabled && (
        // Telefonda pastki menyu ustida, kompyuterda (menyu chapda) — ekran pastida
        <div className="sticky bottom-[calc(var(--safe-bottom)+4.75rem)] z-20 -mx-1 mt-2 rounded-2xl border border-line bg-card p-2 shadow-lg lg:bottom-4">
          {st.busy && <div className="mb-2 rounded-lg bg-orange-500/10 px-2 py-1.5 text-xs text-orange-600">⏱ {t('ai.busy')}</div>}
          {limitReached && <div className="mb-2 rounded-lg bg-red-500/10 px-2 py-1.5 text-xs text-red-600">{t('ai.limitReached')}</div>}
          {answerId && (
            <div className="mb-2 flex items-center justify-between rounded-lg bg-soft px-2 py-1.5 text-xs">
              <span>📎 {t('ai.aboutQuestion')}</span>
              <button onClick={() => setAnswerId(null)} className="text-hint">
                ✕
              </button>
            </div>
          )}
          {image && (
            <div className="relative mb-2 inline-block">
              <img src={image.url} alt="" className="max-h-28 rounded-lg" />
              <button onClick={() => setImage(null)} className="absolute -right-2 -top-2 rounded-full bg-black/70 px-1.5 text-xs text-white">
                ✕
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={!canSend}
              className="shrink-0 rounded-xl bg-soft px-3 py-2.5 text-lg disabled:opacity-40"
              title={t('ai.photo')}
              aria-label={t('ai.photo')}
            >
              📷
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={onPaste}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && window.matchMedia('(min-width: 1024px)').matches) {
                  e.preventDefault();
                  void send();
                }
              }}
              rows={Math.min(5, Math.max(1, text.split('\n').length))}
              maxLength={4000}
              placeholder={t('ai.placeholder')}
              disabled={!canSend && !busy}
              className="min-h-[44px] flex-1 resize-none rounded-xl bg-soft px-3 py-2.5 text-[15px] outline-none"
            />
            <Button onClick={() => void send()} disabled={!canSend || (!text.trim() && !image)} loading={busy} className="shrink-0">
              ➤
            </Button>
          </div>
          {st.limit !== null && <div className="mt-1 text-right text-[11px] text-hint">{t('ai.limit', { used: st.used, limit: st.limit })}</div>}
          <input
            ref={fileRef}
            type="file"
            accept={IMAGE_ACCEPT}
            className="hidden"
            onChange={(e) => {
              void attach(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
        </div>
      )}
    </Page>
  );
}

