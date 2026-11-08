import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Page } from '../../components/Layout';
import { Card, StatTile } from '../../components/ui';
import { api } from '../../lib/api';

interface Stats {
  users: number;
  students: number;
  pending: number;
  active7: number;
  answers30: number;
  accuracy30: number | null;
  mockAvg30: number | null;
  openReports: number;
  dailyToday: number;
  templates: Record<string, number>;
}

const LINKS: Array<[string, string, string, string]> = [
  ['/admin/templates', '📚', 'Savollar banki', 'Shablonlar, preview, avto-tekshiruv, AI'],
  ['/admin/templates/new', '➕', 'Yangi shablon', "Savol qo'shish yoki tayyor testdan yasash"],
  ['/admin/tests', '📝', 'Testlar', 'Mock, bo\'lim, mavzu testlari'],
  ['/teacher', '👥', 'Guruhlar', 'Guruhlar, taklif kodlari, tahlil'],
  ['/admin/users', '🧑‍💼', 'Foydalanuvchilar', 'Rollar va holat'],
  ['/admin/reports', '⚠️', 'Shikoyatlar', '"Savolda xato bor" xabarlari'],
  ['/admin/stats', '📈', 'Statistika', "Markaz natijalari, eng qiyin savollar"],
  ['/admin/scales', '📏', 'Ball shkalasi', 'Xom ball → 200–800'],
  ['/admin/settings', '⚙️', 'Sozlamalar', 'Reyting, unvonlar, mastery, SRS'],
  ['/admin/announce', '📢', "E'lonlar", 'Bot orqali xabar yuborish'],
  ['/admin/import', '📥', 'Import / eksport', 'JSON, CSV/Excel'],
  ['/admin/audit', '🕵️', 'Audit log', "Kim nimani o'zgartirdi"],
];

export default function AdminHome() {
  const q = useQuery({ queryKey: ['admin-stats'], queryFn: () => api<Stats>('/admin/stats') });
  const s = q.data;
  return (
    <Page title="🧭 Admin panel" wide>
      {s && (
        <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatTile label="Faol o'quvchilar" value={s.students} sub={`kutishda: ${s.pending}`} />
          <StatTile label="7 kunda faol" value={s.active7} sub={`bugun kunlik: ${s.dailyToday}`} />
          <StatTile label="Javoblar (30 kun)" value={s.answers30} sub={`aniqlik ${s.accuracy30 ?? '—'}%`} />
          <StatTile label="O'rtacha mock (30 kun)" value={s.mockAvg30 ?? '—'} sub={`shikoyatlar: ${s.openReports}`} color={s.openReports ? '#dc2626' : undefined} />
        </div>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
        {LINKS.map(([to, icon, title, sub]) => (
          <Link key={to} to={to}>
            <Card className="flex h-full items-center gap-3">
              <div className="text-3xl">{icon}</div>
              <div>
                <div className="font-semibold">{title}</div>
                <div className="text-xs text-hint">{sub}</div>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </Page>
  );
}
