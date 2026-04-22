export function mapVisitorBase(row: any) {
  return {
    id: row.id,
    name: row.full_name ?? "",
    nickname: row.nickname ?? "",
    notes: row.notes ?? "",
    createdAt: row.created_at ?? new Date(0).toISOString(),
    attendance: {},
    payments: { sessions: {} },
    stats: { yellow: 0, red: 0 },
    discipline: { yellowPaid: 0, redPaid: 0 }
  };
}

