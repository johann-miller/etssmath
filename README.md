# Math Program Scheduler

Dynamic weekly assignment scheduler for an after-school math program with multiple sites. It automatically determines the current program week (skipping full break weeks), looks up the correct assignment for today's operation day, and links directly to the PDF.

---

## Project Structure

```
etssmath/
├── index.html                        # Single-page app (catalogue + scheduler UI)
├── css/
│   └── styles.css                    # All styling
├── js/
│   └── recommender.js                # Core scheduling logic (loaded globally)
├── data/
│   ├── locations.json                # Site definitions (district, grades, operation days)
│   └── school_calendar.json          # Academic year dates and break periods per district
└── curriculum/
    ├── extract_curriculum.py         # CLI tool: splits a PDF textbook into per-assignment PDFs
    ├── data/
    │   └── grade1_curriculum.json    # Curriculum map (week → assignments → PDF page)
    └── Grade 1/
        ├── Academic Year/
        │   ├── Week 01/
        │   │   ├── 1 - Lesson 1.1 Adding through 3.pdf
        │   │   └── ...
        │   └── ...
        └── Summer Program/
            └── ...
```

---

## Data Files

### `data/locations.json`

Defines each program site.

```json
{
  "locations": [
    {
      "id": "site_east",
      "name": "East",
      "district": "lausd",
      "grades": [1, 2, 3],
      "operation_days": ["monday", "tuesday", "thursday"]
    }
  ]
}
```

| Field | Description |
|---|---|
| `id` | Unique identifier used in URL params (`?site=site_east`) |
| `district` | Key into `school_calendar.json` → `districts` |
| `grades` | Grade numbers served at this site |
| `operation_days` | Ordered list of weekdays the site operates — order determines assignment `order` values |

### `data/school_calendar.json`

Defines academic year and break dates per district.

```json
{
  "districts": {
    "lausd": {
      "academic_year": { "start": "2025-08-25", "end": "2026-06-05" },
      "summer_program": { "start": "2026-06-16", "end": "2026-08-07" },
      "breaks": [
        { "name": "Spring Break", "type": "break", "start": "2026-03-30", "end": "2026-04-03" },
        { "name": "Labor Day",    "type": "holiday", "dates": ["2025-09-01"] }
      ]
    }
  }
}
```

Breaks can be single days (`dates` array) or ranges (`start`/`end`). Any week where **all** operation days fall within breaks is excluded from the week count — the 36-week curriculum maps to 36 non-break instructional weeks.

### `curriculum/data/grade1_curriculum.json`

Maps each program week to its ordered assignments and the source PDF page for each.

```json
{
  "grade": 1,
  "academic_year": {
    "total_weeks": 36,
    "weeks": [
      {
        "week": 1,
        "assignments": [
          { "order": 1, "name": "Lesson 1.1 Adding through 3", "pdf_page": 11 },
          { "order": 2, "name": "Lesson 1.2 Subtracting from 1, 2, and 3", "pdf_page": 12 },
          { "order": 3, "name": "Lesson 1.3 Adding to 4 and 5", "pdf_page": 13 }
        ]
      }
    ]
  },
  "summer_program": {
    "weeks": [ ... ]
  }
}
```

`order` matches the position in `operation_days` — Day 1 of the week gets `order: 1`, Day 2 gets `order: 2`, etc.

---

## Core Logic — `js/recommender.js`

Loaded as a plain `<script>` before `index.html`'s inline script so its functions are available globally.

### `isBreakDay(dateStr, district)`

Returns `true` if the given date string (`"YYYY-MM-DD"`) falls within any break defined for the district.

```js
isBreakDay("2026-03-30", district) // → true (Spring Break)
isBreakDay("2026-03-26", district) // → false
```

### `getProgramWeekNumber(today, district, location)`

Returns the current **instructional week number** (1-indexed), or `null` if today is outside all program dates.

Counts only weeks that have at least one operation day not covered by a break — full break weeks (Spring Break, Winter Break, etc.) are skipped entirely, so week numbers stay aligned with the 36-week curriculum.

```js
const weekNum = getProgramWeekNumber(new Date(), district, location);
// → 28  (for example)
// → null if outside academic year and summer program
```

**How it works:**
1. Determines whether today is in the academic year or summer program.
2. Finds the Monday of the program's start week and the Monday of the current week.
3. Walks forward one calendar week at a time. For each week, checks whether any operation day in that week is not a break day.
4. Increments the counter only for weeks with at least one valid instructional day.

### `getLastOpDayOrder(today, opDays)`

When today is not an operation day (weekend, holiday), returns the `order` of the most recent operation day. Used to show the last applicable assignment on non-operation days.

```js
// If opDays = ["monday","tuesday","thursday"] and today is Wednesday:
getLastOpDayOrder(new Date(), opDays) // → 2  (Tuesday was most recent)
```

### `getRecommendation(today, location, district, gradeData)`

Main recommendation function. Returns an object describing today's assignment.

```js
const rec = getRecommendation(new Date(), location, district, gradeData);
```

Return shape:

| Field | Type | Description |
|---|---|---|
| `status` | string | `"operation_day"`, `"non_operation_day"`, `"out_of_session"`, or `"no_curriculum"` |
| `isOperationDay` | boolean | Whether today is an active operation day |
| `week` | number | Current instructional week number |
| `isSummer` | boolean | Whether currently in summer program |
| `assignmentOrder` | number | Which assignment in the week (1, 2, 3…) |
| `assignment` | object | `{ order, name }` from the curriculum JSON |

### `sanitizeFilename(name)`

Strips characters that are invalid in file paths (`< > : " / \ | ? *`) and normalizes whitespace. Used in both `recommender.js` and `extract_curriculum.py` to ensure PDF filenames match the paths built at runtime.

```js
sanitizeFilename('Lesson 1.1 Adding through 3') // → 'Lesson 1.1 Adding through 3'
sanitizeFilename('Ratio: Part/Whole')            // → 'Ratio PartWhole'
```

---

## Catalogue UI — `index.html`

The inline script in `index.html` builds the full curriculum catalogue and wires the scheduler card. Key functions:

### `initScheduler()`

Entry point (runs on `DOMContentLoaded`). Fetches `locations.json` and `school_calendar.json`, populates the site dropdown, reads the `?site=` URL param to pre-select a site, and calls `render()` on dropdown changes.

### `render()`

Called whenever the site selection changes. Calls `getProgramWeekNumber` and `getRecommendation` for each grade at the selected site, then builds the scheduler card DOM showing today's assignment with a link to the PDF.

### `jumpToCatalogueWeek(grade, isSummer, weekNum)`

Scrolls the full curriculum catalogue to a specific week card. Called by the "All assignments for week N" button in the scheduler card. Opens the grade and year sections if collapsed, then smooth-scrolls to the target week.

### `buildGradeSection(label, grade, gradeDir, data)`

Builds a collapsible section for one grade containing both Academic Year and Summer Program sub-sections.

### `buildYearSection(label, type, weeks, gradeDir, yearFolder, grade)`

Builds a collapsible sub-section (Academic Year or Summer Program) containing all week cards.

### `buildAssignments(weeks, gradeDir, yearFolder, isSummer, grade)`

Renders all week cards for a given program, each containing clickable PDF links for every assignment.

### `assignmentPath(gradeDir, yearFolder, weekNum, assignment)`

Constructs the relative path to an assignment PDF:

```
curriculum/Grade 1/Academic Year/Week 03/2 - Lesson 1.6 Adding to 7.pdf
```

---

## PDF Extraction Tool — `curriculum/extract_curriculum.py`

A one-time CLI tool that takes a source textbook PDF and the curriculum JSON and splits it into individual per-assignment PDFs, creating the `Grade N/Academic Year/Week NN/` directory structure that the app links to.

**Requirements:** `pypdf` (`pip install pypdf`)

**Usage:**

```bash
cd curriculum
python extract_curriculum.py <textbook.pdf> [--json <curriculum_json>]
```

- `pdf_file` — path to the source PDF textbook
- `--json` — path to the curriculum JSON (auto-detected if a single `grade*_curriculum.json` exists in the same directory as the PDF)

**Example:**

```bash
python extract_curriculum.py "Grade 1 Textbook.pdf" --json data/grade1_curriculum.json
```

This reads each assignment's `pdf_page` from the JSON and extracts that page into:

```
Grade 1/Academic Year/Week 01/1 - Lesson 1.1 Adding through 3.pdf
Grade 1/Academic Year/Week 01/2 - Lesson 1.2 Subtracting from 1, 2, and 3.pdf
...
Grade 1/Summer Program/Week 01/1 - ...pdf
```

---

## Adding a New Grade

1. Create `curriculum/data/gradeN_curriculum.json` following the same structure as `grade1_curriculum.json`.
2. Run `extract_curriculum.py` to generate the PDF files.
3. Add the grade to `GRADE_CURRICULUM_FILES` in `js/recommender.js`:
   ```js
   const GRADE_CURRICULUM_FILES = {
     1: "curriculum/data/grade1_curriculum.json",
     2: "curriculum/data/grade2_curriculum.json"  // add here
   };
   ```
4. Add the grade to the `GRADES` array in `index.html`:
   ```js
   const GRADES = [
     { label: 'Grade 1', grade: 1, gradeDir: 'curriculum/Grade 1', file: 'curriculum/data/grade1_curriculum.json' },
     { label: 'Grade 2', grade: 2, gradeDir: 'curriculum/Grade 2', file: 'curriculum/data/grade2_curriculum.json' }
   ];
   ```
5. Add the grade to the relevant site(s) in `data/locations.json`.

## Adding a New Site

Add an entry to `data/locations.json`. The `district` must match a key in `school_calendar.json`. The `operation_days` order defines which assignment (`order: 1`, `order: 2`, …) is shown on which day.

## Adding a New District

Add an entry to `data/school_calendar.json` under `districts`, then reference it from the site's `district` field in `locations.json`.

---

## Deployment

**GitHub Pages:**
1. Push to GitHub
2. Settings → Pages → Source: `main` branch, root `/`
3. Access at `https://<username>.github.io/<repo>`

No build step required — the app is plain HTML/CSS/JS served as static files.
