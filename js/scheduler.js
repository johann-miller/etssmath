let curriculum = [];
let locations = [];
let districts = {};

// Load all data
async function loadData() {
    try {
        const [currData, locData, distData] = await Promise.all([
            fetch('data/curriculum.json').then(r => r.json()),
            fetch('data/locations.json').then(r => r.json()),
            fetch('data/districts.json').then(r => r.json())
        ]);
        
        curriculum = currData;
        locations = locData;
        districts = distData;
        
        initializeApp();
    } catch (error) {
        console.error('Error loading data:', error);
        document.querySelector('.card').innerHTML = '<p style="color: red;">Error loading schedule data.</p>';
    }
}

function getSchoolYear() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    return month >= 8 ? year : year - 1;
}

function getProgramWeeks(schoolYear, location) {
    const weeks = [];
    const startDate = new Date(schoolYear, 8, 1); // September 1
    
    // Find second Monday of September
    while (startDate.getDay() !== 1) {
        startDate.setDate(startDate.getDate() + 1);
    }
    startDate.setDate(startDate.getDate() + 7); // Second Monday
    
    const endDate = new Date(schoolYear + 1, 4, 31); // May 31
    
    let currentWeek = new Date(startDate);
    
    while (currentWeek <= endDate) {
        const weekEnd = new Date(currentWeek);
        weekEnd.setDate(weekEnd.getDate() + 6); // Sunday
        
        // Check if week overlaps with breaks
        const districtBreaks = districts[location.district] || [];
        const isBreak = districtBreaks.some(brk => {
            const breakStart = new Date(brk.start);
            const breakEnd = new Date(brk.end);
            return currentWeek <= breakEnd && weekEnd >= breakStart;
        });
        
        if (!isBreak) {
            weeks.push({
                start: new Date(currentWeek),
                end: weekEnd
            });
        }
        
        currentWeek.setDate(currentWeek.getDate() + 7);
    }
    
    return weeks;
}

function getCurrentWeek(weeks) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    return weeks.findIndex(week => {
        const start = new Date(week.start);
        const end = new Date(week.end);
        start.setHours(0, 0, 0, 0);
        end.setHours(23, 59, 59, 999);
        return today >= start && today <= end;
    });
}

function formatDateRange(start, end) {
    const options = { month: 'short', day: 'numeric' };
    const startStr = start.toLocaleDateString('en-US', options);
    const endStr = end.toLocaleDateString('en-US', options);
    return `${startStr} - ${endStr}`;
}

function renderLocationSelect() {
    const select = document.getElementById('location-select');
    select.innerHTML = locations.map(loc => 
        `<option value="${loc.id}">${loc.name}</option>`
    ).join('');
    
    select.addEventListener('change', updateSchedule);
}

function updateSchedule() {
    const locationId = document.getElementById('location-select').value;
    const location = locations.find(l => l.id === locationId);
    const schoolYear = getSchoolYear();
    
    const programWeeks = getProgramWeeks(schoolYear, location);
    const currentWeekIndex = getCurrentWeek(programWeeks);
    const currentWeek = currentWeekIndex >= 0 ? programWeeks[currentWeekIndex] : null;
    
    renderWeekInfo(currentWeek, currentWeekIndex, programWeeks.length, schoolYear);
    renderAssignments(currentWeekIndex);
}

function renderWeekInfo(currentWeek, weekIndex, totalWeeks, schoolYear) {
    const container = document.getElementById('current-week-info');
    
    if (currentWeek) {
        container.className = 'week-info';
        container.innerHTML = `
            <h2>Current Week: ${formatDateRange(currentWeek.start, currentWeek.end)}</h2>
            <p>Program Week ${weekIndex + 1} of ${totalWeeks} • School Year ${schoolYear}-${schoolYear + 1}</p>
        `;
    } else {
        container.className = 'week-info no-session';
        container.innerHTML = `
            <p>Program is not currently in session or no current week found.</p>
        `;
    }
}

function renderAssignments(weekIndex) {
    const container = document.getElementById('assignments-container');
    
    if (weekIndex < 0) {
        container.innerHTML = '<div class="no-assignments">No assignments available.</div>';
        return;
    }
    
    const startLessonIndex = weekIndex * 3;
    const lessons = curriculum.slice(startLessonIndex, startLessonIndex + 3);
    
    if (lessons.length === 0) {
        container.innerHTML = '<div class="no-assignments">No lessons assigned for this week.</div>';
        return;
    }
    
    container.innerHTML = lessons.map((lesson, index) => `
        <div class="assignment-card">
            <div class="assignment-number">${index + 1}</div>
            <div class="assignment-content">
                <h4>${lesson.title}</h4>
                <p class="description">${lesson.description}</p>
                <p class="lesson-number">Lesson #${lesson.id} in curriculum</p>
            </div>
        </div>
    `).join('');
}

function initializeApp() {
    renderLocationSelect();
    updateSchedule();
}

// Start the app
loadData();