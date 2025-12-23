# Math Program Scheduler

Dynamic weekly schedule for after-school math program with multiple locations.

## Features

- Automatically calculates current week based on school calendar
- Sequential curriculum mapping (Week 1 = Lessons 1-3, etc.)
- Skips district-specific break weeks
- Consistent week boundaries regardless of month transitions

## Setup

1. Clone repository
2. Update JSON files with your data:
   - `data/curriculum.json` - Add all lessons in sequential order
   - `data/locations.json` - Add all program locations
   - `data/districts.json` - Add break dates for each district
3. Open `index.html` in browser or deploy to GitHub Pages

## Deployment

**GitHub Pages:**
1. Push to GitHub
2. Settings → Pages → Source: main branch
3. Access at: `https://yourusername.github.io/math-program-scheduler`

## Updating Schedule

Edit JSON files in `data/` folder and commit changes. Schedule updates automatically on page load.