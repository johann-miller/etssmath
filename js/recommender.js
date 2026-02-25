// Returns { isOperationDay, assignmentOrder, week, assignment, status }
function getRecommendation(today, location, district, gradeData) {
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const todayName = dayNames[today.getDay()];
  const opDays = location.operation_days; // e.g. ["monday","wednesday","friday"]

  // Check if today is a break/holiday
  const todayStr = today.toISOString().split("T")[0];
  const isBreak = isBreakDay(todayStr, district);

  // Determine current program week number (skip break weeks)
  const weekNum = getProgramWeekNumber(today, district, location);
  if (weekNum === null) {
    return { status: "out_of_session" };
  }

  const weekData = gradeData.academic_year.weeks.find(w => w.week === weekNum);
  if (!weekData) return { status: "no_curriculum" };

  const isOpDay = opDays.includes(todayName) && !isBreak;

  let assignmentOrder;
  if (isOpDay) {
    // Which operation day of the week is today? (1, 2, or 3)
    assignmentOrder = opDays.indexOf(todayName) + 1;
  } else {
    // Not an operation day — find the most recent past op day this week
    assignmentOrder = getLastOpDayOrder(today, opDays, isBreak);
  }

  const assignment = weekData.assignments.find(a => a.order === assignmentOrder);

  return {
    status: isOpDay ? "operation_day" : "non_operation_day",
    isOperationDay: isOpDay,
    week: weekNum,
    assignmentOrder,
    assignment
  };
}

function isBreakDay(dateStr, district) {
  return district.breaks.some(brk => {
    if (brk.dates) return brk.dates.includes(dateStr);
    return dateStr >= brk.start && dateStr <= brk.end;
  });
}

function getLastOpDayOrder(today, opDays, todayIsBreak) {
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  // Walk backwards through the week to find the last op day that already passed
  for (let i = 1; i <= 7; i++) {
    const past = new Date(today);
    past.setDate(past.getDate() - i);
    const pastName = dayNames[past.getDay()];
    if (opDays.includes(pastName)) {
      return opDays.indexOf(pastName) + 1;
    }
  }
  return 1; // fallback
}