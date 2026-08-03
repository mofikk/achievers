(function () {
  const DEFAULT_INDEX_WEIGHTS = {
    performance: {
      goals: 0.45,
      goalsPerAppearance: 0.25,
      attendance: 0.3
    },
    contribution: {
      attendance: 0.45,
      monthlyPayments: 0.25,
      yearlyPayments: 0.15
    },
    discipline: {
      yellowCard: -1,
      redCard: -2,
      paidYellowFine: 0.5,
      paidRedFine: 1
    },
    overall: {
      scale: 2
    }
  };

  function clamp(value, min = 0, max = 100) {
    return Math.min(Math.max(Number(value) || 0, min), max);
  }

  function round(value) {
    return Math.round(clamp(value));
  }

  function safeRatio(paid, expected) {
    const expectedAmount = Number(expected) || 0;
    if (expectedAmount <= 0) return 0;
    return clamp(((Number(paid) || 0) / expectedAmount) * 100);
  }

  function getAttendanceSummary(player, attendanceDates) {
    if (window.attendanceMetrics?.getPlayerAttendanceSummary) {
      return window.attendanceMetrics.getPlayerAttendanceSummary(player, attendanceDates);
    }
    const dates = Array.isArray(attendanceDates) ? attendanceDates : [];
    const present = dates.reduce((count, date) => {
      return count + (player?.attendance?.[date] === true ? 1 : 0);
    }, 0);
    const total = dates.length;
    const attendancePercent = total > 0 ? Math.round((present / total) * 100) : 0;
    return { present, total, attendancePercent };
  }

  function getMonthlyExpected(settings, monthKey) {
    if (window.paymentStatus?.getMonthlyExpected) {
      return window.paymentStatus.getMonthlyExpected(settings, monthKey);
    }
    return 0;
  }

  function getYearlyExpected(settings, player, yearKey) {
    if (window.paymentStatus?.getYearlyExpected) {
      return window.paymentStatus.getYearlyExpected(settings, player, yearKey);
    }
    return 0;
  }

  function getPaymentScore(player, settings, yearKey, monthKey) {
    const yearlyExpected = getYearlyExpected(settings, player, yearKey);
    const yearlyPaid = Number(player?.payments?.yearly?.[yearKey]?.paid) || 0;
    const monthlyExpected = getMonthlyExpected(settings, monthKey);
    const monthlyPaid = Number(player?.payments?.monthly?.[monthKey]?.paid) || 0;

    return {
      yearlyPaid,
      yearlyExpected,
      yearlyScore: safeRatio(yearlyPaid, yearlyExpected),
      monthlyPaid,
      monthlyExpected,
      monthlyScore: safeRatio(monthlyPaid, monthlyExpected)
    };
  }

  function getDisciplineAdjustment(player, weights) {
    const stats = player?.stats || {};
    const discipline = player?.discipline || {};
    const yellow = Number(stats.yellow) || 0;
    const red = Number(stats.red) || 0;
    const yellowPaid = Math.min(Number(discipline.yellowPaid) || 0, yellow);
    const redPaid = Math.min(Number(discipline.redPaid) || 0, red);
    const yellowPenalty = Number(weights.yellowCard) || 0;
    const redPenalty = Number(weights.redCard) || 0;
    const paidYellowCredit = Number(weights.paidYellowFine) || 0;
    const paidRedCredit = Number(weights.paidRedFine) || 0;
    const adjustment = Math.min(
      0,
      yellow * yellowPenalty +
        red * redPenalty +
        yellowPaid * paidYellowCredit +
        redPaid * paidRedCredit
    );

    return {
      yellow,
      red,
      yellowPaid,
      redPaid,
      adjustment
    };
  }

  function weightedAverage(parts, weights) {
    const totalWeight = Object.keys(parts).reduce((total, key) => {
      return total + (Number(weights[key]) || 0);
    }, 0);
    if (totalWeight <= 0) return 0;
    return Object.keys(parts).reduce((total, key) => {
      return total + clamp(parts[key]) * ((Number(weights[key]) || 0) / totalWeight);
    }, 0);
  }

  function byScoreThenName(scoreKey) {
    return (a, b) => {
      if (b[scoreKey] !== a[scoreKey]) return b[scoreKey] - a[scoreKey];
      return String(a.name || "").localeCompare(String(b.name || ""));
    };
  }

  function buildPlayerIndexes(players, settings, attendanceDates, options = {}) {
    const weights = {
      performance: { ...DEFAULT_INDEX_WEIGHTS.performance, ...options.performance },
      contribution: { ...DEFAULT_INDEX_WEIGHTS.contribution, ...options.contribution },
      discipline: { ...DEFAULT_INDEX_WEIGHTS.discipline, ...options.discipline },
      overall: { ...DEFAULT_INDEX_WEIGHTS.overall, ...options.overall }
    };
    const yearKey = String(options.yearKey || settings?.season || new Date().getFullYear());
    const monthKey = String(options.monthKey || "");
    const safePlayers = Array.isArray(players) ? players : [];
    const maxGoals = Math.max(...safePlayers.map((player) => Number(player?.stats?.goals) || 0), 0);
    const baseRows = safePlayers.map((player) => {
      const stats = player?.stats || {};
      const goals = Number(stats.goals) || 0;
      const attendance = getAttendanceSummary(player, attendanceDates);
      const goalsPerAppearance = attendance.present > 0 ? goals / attendance.present : 0;
      return { player, goals, attendance, goalsPerAppearance };
    });
    const maxGoalsPerAppearance = Math.max(...baseRows.map((row) => row.goalsPerAppearance), 0);

    const rows = baseRows.map((row) => {
      const payment = getPaymentScore(row.player, settings, yearKey, monthKey);
      const discipline = getDisciplineAdjustment(row.player, weights.discipline);
      const goalScore = maxGoals > 0 ? (row.goals / maxGoals) * 100 : 0;
      const goalsPerAppearanceScore =
        maxGoalsPerAppearance > 0 ? (row.goalsPerAppearance / maxGoalsPerAppearance) * 100 : 0;
      const performanceRaw = weightedAverage(
        {
          goals: goalScore,
          goalsPerAppearance: goalsPerAppearanceScore,
          attendance: row.attendance.attendancePercent
        },
        weights.performance
      );
      const contributionRaw = weightedAverage(
        {
          attendance: row.attendance.attendancePercent,
          monthlyPayments: payment.monthlyScore,
          yearlyPayments: payment.yearlyScore
        },
        weights.contribution
      );
      const performanceIndex = round(performanceRaw);
      const contributionIndex = round(contributionRaw);
      const overallScale = Number(weights.overall.scale) || 2;
      const overallIndex = round(
        (performanceIndex + contributionIndex + discipline.adjustment) / overallScale
      );

      return {
        id: row.player?.id,
        name: row.player?.name || "",
        nickname: row.player?.nickname || "",
        position: row.player?.position || "",
        performanceIndex,
        contributionIndex,
        overallIndex,
        metrics: {
          goals: row.goals,
          appearances: row.attendance.present,
          totalMatches: row.attendance.total,
          goalsPerAppearance: row.goalsPerAppearance,
          attendancePercentage: row.attendance.attendancePercent,
          monthlyPaymentPercentage: round(payment.monthlyScore),
          yearlyPaymentPercentage: round(payment.yearlyScore),
          monthlyPaymentStatus: window.paymentStatus?.statusFromPaid
            ? window.paymentStatus.statusFromPaid(payment.monthlyExpected, payment.monthlyPaid).status
            : payment.monthlyScore >= 100
              ? "PAID"
              : payment.monthlyScore > 0
                ? "INCOMPLETE"
                : "PENDING",
          yearlyPaymentStatus: window.paymentStatus?.statusFromPaid
            ? window.paymentStatus.statusFromPaid(payment.yearlyExpected, payment.yearlyPaid).status
            : payment.yearlyScore >= 100
              ? "PAID"
              : payment.yearlyScore > 0
                ? "INCOMPLETE"
                : "PENDING",
          yellowCards: discipline.yellow,
          redCards: discipline.red,
          paidYellowCardFines: discipline.yellowPaid,
          paidRedCardFines: discipline.redPaid,
          disciplineAdjustment: discipline.adjustment,
          paidCardFines: discipline.yellowPaid + discipline.redPaid
        }
      };
    });

    return {
      weights,
      players: rows,
      rankings: {
        performance: [...rows].sort(byScoreThenName("performanceIndex")),
        contribution: [...rows].sort(byScoreThenName("contributionIndex")),
        overall: [...rows].sort(byScoreThenName("overallIndex"))
      }
    };
  }

  window.playerIndexes = {
    DEFAULT_INDEX_WEIGHTS,
    buildPlayerIndexes
  };
})();
