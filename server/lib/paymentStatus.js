function getMonthlyExpected(settings, monthKey) {
  const schedule = settings?.fees?.monthlySchedule || [];
  if (!schedule.length) return 0;

  const sorted = [...schedule].sort((a, b) => String(a.from).localeCompare(String(b.from)));
  let candidate = Number(sorted[0]?.amount) || 0;

  sorted.forEach((item) => {
    if (item && item.from && item.from <= monthKey) {
      const amount = Number(item.amount);
      if (Number.isFinite(amount)) candidate = amount;
    }
  });

  return candidate;
}

function getMemberSinceYear(settings, player) {
  const stored = Number(player?.membership?.memberSinceYear);
  if (Number.isFinite(stored) && stored > 0) return stored;

  const years = Object.keys(player?.subscriptions?.year || {})
    .map((year) => Number(year))
    .filter((year) => Number.isFinite(year));
  if (years.length) {
    years.sort((a, b) => a - b);
    return years[0];
  }

  return Number(settings?.season) || new Date().getFullYear();
}

function getYearlyExpected(settings, player, yearKey) {
  const memberSinceYear = getMemberSinceYear(settings, player);
  const expected =
    Number(yearKey) === memberSinceYear
      ? Number(settings?.fees?.newMemberYearly)
      : Number(settings?.fees?.renewalYearly);
  return Number.isFinite(expected) ? expected : 0;
}

function statusFromPaid(expected, paid) {
  const expectedNum = Number(expected) || 0;
  const paidNum = Number(paid) || 0;

  if (expectedNum > 0) {
    if (paidNum >= expectedNum) {
      return { status: "PAID", remaining: 0 };
    }
    if (paidNum === 0) {
      return { status: "PENDING", remaining: expectedNum };
    }
    return { status: "INCOMPLETE", remaining: Math.max(expectedNum - paidNum, 0) };
  }

  if (paidNum > 0) {
    return { status: "INCOMPLETE", remaining: 0 };
  }

  return { status: "PENDING", remaining: 0 };
}

function getPlayerPaymentSummary(db, settings, playerId, yearKey, monthKey) {
  const player = db?.players?.find((item) => item.id === playerId);
  if (!player) return null;

  const yearlyExpected = getYearlyExpected(settings, player, yearKey);
  const yearlyPaid = Number(player?.payments?.yearly?.[yearKey]?.paid) || 0;
  const yearlyStatus = statusFromPaid(yearlyExpected, yearlyPaid);

  const monthlyExpected = getMonthlyExpected(settings, monthKey);
  const monthlyPaid = Number(player?.payments?.monthly?.[monthKey]?.paid) || 0;
  const monthlyStatus = statusFromPaid(monthlyExpected, monthlyPaid);

  return {
    yearly: {
      expected: yearlyExpected,
      paid: yearlyPaid,
      remaining: yearlyStatus.remaining,
      status: yearlyStatus.status
    },
    monthly: {
      expected: monthlyExpected,
      paid: monthlyPaid,
      remaining: monthlyStatus.remaining,
      status: monthlyStatus.status
    }
  };
}

module.exports = {
  getMonthlyExpected,
  getYearlyExpected,
  statusFromPaid,
  getPlayerPaymentSummary
};
