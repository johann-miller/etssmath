// ── Filename sanitization (mirrors Python extract_curriculum.py) ─────────────

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim();
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUMMER_OPERATION_DAYS = ["monday", "tuesday", "wednesday", "thursday"];

// ── Core logic helpers ────────────────────────────────────────────────────────

function isBreakDay(dateStr, district) {
  return district.breaks.some(brk => {
    if (brk.dates) return brk.dates.includes(dateStr);
    return dateStr >= brk.start && dateStr <= brk.end;
  });
}

function getLastOpDayOrder(today, opDays) {
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  for (let i = 1; i <= 7; i++) {
    const past = new Date(today);
    past.setDate(past.getDate() - i);
    const pastName = dayNames[past.getDay()];
    if (opDays.includes(pastName)) {
      return opDays.indexOf(pastName) + 1;
    }
  }
  return 1;
}

function getProgramWeekNumber(today, district, location) {
  const todayStr = today.toISOString().split("T")[0];
  const ay = district.academic_year;
  const sp = district.summer_program;

  let programStart, programEnd, isSummer;

  if (todayStr >= ay.start && todayStr <= ay.end) {
    programStart = ay.start;
    programEnd = ay.end;
    isSummer = false;
  } else if (sp && todayStr >= sp.start && todayStr <= sp.end) {
    programStart = sp.start;
    programEnd = sp.end;
    isSummer = true;
  } else {
    return null;
  }

  const opDays = isSummer ? SUMMER_OPERATION_DAYS : location.operation_days;
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];

  // Find the Monday of the program start week
  const startDate = new Date(programStart + "T00:00:00");
  const startMonday = new Date(startDate);
  startMonday.setDate(startDate.getDate() - (startDate.getDay() === 0 ? 6 : startDate.getDay() - 1));

  // Find the Monday of today's week
  const todayDate = new Date(todayStr + "T00:00:00");
  const todayMonday = new Date(todayDate);
  todayMonday.setDate(todayDate.getDate() - (todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1));

  let weekNum = 0;
  let weekStart = new Date(startMonday);

  while (weekStart <= todayMonday) {
    // Count this as a program week if it has at least one valid operation day
    let hasOpDay = false;
    for (let d = 0; d < 7; d++) {
      const day = new Date(weekStart);
      day.setDate(weekStart.getDate() + d);
      const dayStr = day.toISOString().split("T")[0];
      const dayName = dayNames[day.getDay()];
      if (
        opDays.includes(dayName) &&
        !isBreakDay(dayStr, district) &&
        dayStr >= programStart &&
        dayStr <= programEnd
      ) {
        hasOpDay = true;
        break;
      }
    }
    if (hasOpDay) weekNum++;
    weekStart.setDate(weekStart.getDate() + 7);
  }

  return weekNum > 0 ? weekNum : null;
}

function getRecommendation(today, location, district, gradeData) {
  const dayNames = ["sunday","monday","tuesday","wednesday","thursday","friday","saturday"];
  const todayName = dayNames[today.getDay()];
  const todayStr = today.toISOString().split("T")[0];
  const isBreak = isBreakDay(todayStr, district);

  const weekNum = getProgramWeekNumber(today, district, location);
  if (weekNum === null) return { status: "out_of_session" };

  const sp = district.summer_program;
  const isSummer = sp && todayStr >= sp.start && todayStr <= sp.end;
  const opDays = isSummer ? SUMMER_OPERATION_DAYS : location.operation_days;
  const weeks = isSummer
    ? gradeData.summer_program?.weeks
    : gradeData.academic_year?.weeks;

  if (!weeks) return { status: "no_curriculum" };
  const weekData = weeks.find(w => w.week === weekNum);
  if (!weekData) return { status: "no_curriculum" };

  const isOpDay = opDays.includes(todayName) && !isBreak;
  const assignmentOrder = isOpDay
    ? opDays.indexOf(todayName) + 1
    : getLastOpDayOrder(today, opDays);

  const assignment = weekData.assignments.find(a => a.order === assignmentOrder);

  return {
    status: isOpDay ? "operation_day" : "non_operation_day",
    isOperationDay: isOpDay,
    week: weekNum,
    isSummer,
    assignmentOrder,
    assignment,
    topic: weekData.topic || null
  };
}

// ── Grade → curriculum file mapping ──────────────────────────────────────────

const GRADE_CURRICULUM_FILES = {
  1: "curriculum/data/grade1_curriculum.json",
  2: "curriculum/data/grade2_curriculum.json",
  3: "curriculum/data/grade3_curriculum.json",
  4: "curriculum/data/grade4_curriculum.json",
  5: "curriculum/data/grade5_curriculum.json",
  6: "curriculum/data/grade6_curriculum.json",
  7: "curriculum/data/grade7_curriculum.json",
  8: "curriculum/data/grade8_curriculum.json"
};

// ── Scheduler UI ──────────────────────────────────────────────────────────────

async function initScheduler() {
  const [locData, calData] = await Promise.all([
    fetch("data/locations.json").then(r => r.json()),
    fetch("data/school_calendar.json").then(r => r.json())
  ]);

  const siteSelect = document.getElementById("location-select");
  const weekInfoEl = document.getElementById("current-week-info");
  const container = document.getElementById("assignments-container");
  const siteFormGroup = siteSelect.closest(".form-group");

  // ── Debug date override ───────────────────────────────────────────────────────

  let debugToday = null;
  function getToday() {
    return debugToday ? new Date(debugToday + "T12:00:00") : new Date();
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("debug") === "true") {
    const debugGroup = document.createElement("div");
    debugGroup.className = "form-group";
    debugGroup.innerHTML = `<label for="debug-date">Debug Date</label><input type="date" id="debug-date" />`;
    siteFormGroup.parentElement.appendChild(debugGroup);
    document.getElementById("debug-date").addEventListener("change", e => {
      debugToday = e.target.value || null;
      renderAll();
    });
  }

  // ── Populate site selector ────────────────────────────────────────────────────

  const blankOpt = document.createElement("option");
  blankOpt.value = "";
  blankOpt.textContent = "-- Select a site --";
  siteSelect.appendChild(blankOpt);

  locData.locations.forEach(loc => {
    const opt = document.createElement("option");
    opt.value = loc.id;
    opt.textContent = loc.name;
    siteSelect.appendChild(opt);
  });

  // Pre-select from URL param if present
  const siteParam = params.get("site");
  if (siteParam && locData.locations.some(l => l.id === siteParam)) {
    siteSelect.value = siteParam;
  }

  // ── Render helpers ────────────────────────────────────────────────────────────

  function showPrompt() {
    weekInfoEl.className = "week-info";
    weekInfoEl.textContent = "";
    container.innerHTML = "";
  }

  async function renderSchedule(location, district) {
    const today = getToday();
    const todayStr = today.toISOString().split("T")[0];

    const weekNum = getProgramWeekNumber(today, district, location);

    if (weekNum === null) {
      weekInfoEl.className = "week-info no-session";
      weekInfoEl.textContent = "No Session";
      container.innerHTML = "";
      return;
    }

    const isSummer = district.summer_program &&
      todayStr >= district.summer_program.start &&
      todayStr <= district.summer_program.end;
    const programLabel = isSummer ? "Summer Program" : "Academic Year";

    weekInfoEl.className = "week-info";
    weekInfoEl.textContent = `Week ${weekNum} · ${programLabel}`;

    container.innerHTML = "";

    for (const grade of location.grades) {
      const file = GRADE_CURRICULUM_FILES[grade];

      const gradeSection = document.createElement("div");
      gradeSection.style.marginBottom = "0.75rem";

      const gradeLabel = document.createElement("div");
      gradeLabel.className = "scheduler-assignments";
      gradeLabel.innerHTML = `<h4>Grade ${grade}</h4>`;
      gradeSection.appendChild(gradeLabel);

      if (!file) {
        const msg = document.createElement("div");
        msg.className = "scheduler-assignment-item";
        msg.style.color = "var(--muted)";
        msg.textContent = "No curriculum data available.";
        gradeSection.appendChild(msg);
      } else {
        try {
          const gradeData = await fetch(file).then(r => r.json());
          const rec = getRecommendation(today, location, district, gradeData);

          if (rec.status === "out_of_session" || rec.status === "no_curriculum" || !rec.assignment) {
            const msg = document.createElement("div");
            msg.className = "scheduler-assignment-item";
            msg.style.color = "var(--muted)";
            msg.textContent = "No assignment for this week.";
            gradeSection.appendChild(msg);
          } else {
            const item = document.createElement("div");
            item.className = "scheduler-assignment-item";

            const num = document.createElement("div");
            num.className = "num" + (rec.isSummer ? " summer" : "");
            num.textContent = rec.assignment.order;

            const gradeDir = `curriculum/Grade ${grade}`;
            const yearFolder = rec.isSummer ? "Summer Program" : "Academic Year";
            const weekFolder = `Week ${String(rec.week).padStart(2, "0")}`;
            const filename = `${rec.assignment.order} - ${sanitizeFilename(rec.assignment.name)}.pdf`;

            const textWrap = document.createElement("div");
            textWrap.className = "scheduler-assignment-text";

            const link = document.createElement("a");
            link.href = `${gradeDir}/${yearFolder}/${weekFolder}/${filename}`;
            link.textContent = rec.assignment.name;
            link.target = "_blank";
            textWrap.appendChild(link);

            if (rec.topic) {
              const topicEl = document.createElement("div");
              topicEl.className = "scheduler-week-topic";
              topicEl.textContent = rec.topic;
              textWrap.appendChild(topicEl);
            }

            const assignmentMain = document.createElement("div");
            assignmentMain.className = "scheduler-assignment-main";
            assignmentMain.appendChild(num);
            assignmentMain.appendChild(textWrap);

            item.appendChild(assignmentMain);
            gradeSection.appendChild(item);

            // Update the program panel's jump link for this grade
            const type = rec.isSummer ? 'summer' : 'academic';
            const jumpEl = document.getElementById(`jump-current-week-${grade}-${type}`);
            if (jumpEl) {
              jumpEl.dataset.week = rec.week;
              jumpEl.style.display = '';
            }
          }
        } catch {
          const msg = document.createElement("div");
          msg.className = "scheduler-assignment-item";
          msg.style.color = "var(--muted)";
          msg.textContent = "Could not load curriculum.";
          gradeSection.appendChild(msg);
        }
      }

      container.appendChild(gradeSection);
    }
  }

  async function renderAll() {
    const today = getToday();
    const todayStr = today.toISOString().split("T")[0];

    // Check if the current (possibly overridden) date is in a summer program
    let summerDistrict = null;
    for (const district of Object.values(calData.districts)) {
      if (district.summer_program &&
          todayStr >= district.summer_program.start &&
          todayStr <= district.summer_program.end) {
        summerDistrict = district;
        break;
      }
    }

    if (summerDistrict) {
      // Hide site selector — all sites share the same summer schedule
      siteFormGroup.style.display = "none";
      const allGrades = [...new Set(locData.locations.flatMap(l => l.grades))].sort((a, b) => a - b);
      await renderSchedule({ operation_days: SUMMER_OPERATION_DAYS, grades: allGrades }, summerDistrict);
    } else {
      siteFormGroup.style.display = "";
      const location = locData.locations.find(l => l.id === siteSelect.value);
      if (!location) { showPrompt(); return; }
      const district = calData.districts[location.district];
      await renderSchedule(location, district);
    }
  }

  siteSelect.addEventListener("change", () => {
    const location = locData.locations.find(l => l.id === siteSelect.value);
    if (location) {
      const url = new URL(window.location);
      url.searchParams.set("site", location.id);
      history.replaceState(null, "", url.toString());
    }
    renderAll();
  });

  renderAll();
}

document.addEventListener("DOMContentLoaded", initScheduler);
