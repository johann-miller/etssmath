#!/usr/bin/env python3
"""
Extract curriculum assignments from a PDF file based on a curriculum JSON file.
Usage: python extract_curriculum.py <pdf_filename> [--json <json_file>]
"""

import json
import os
import re
import sys
import argparse
from pathlib import Path
from pypdf import PdfReader, PdfWriter


def sanitize_filename(name: str) -> str:
    """Remove or replace characters that are invalid in filenames."""
    name = re.sub(r'[<>:"/\\|?*]', '', name)
    name = re.sub(r'\s+', ' ', name).strip()
    return name


def extract_page(reader: PdfReader, page_number: int, output_path: str):
    """Extract a single page (1-indexed) from reader and save to output_path."""
    writer = PdfWriter()
    writer.add_page(reader.pages[page_number - 1])
    with open(output_path, "wb") as f:
        writer.write(f)


def process_weeks(reader: PdfReader, weeks: list, parent_dir: str):
    """Create week subdirectories and extract assignment PDFs."""
    for week_data in weeks:
        week_num = week_data["week"]
        week_dir = os.path.join(parent_dir, f"Week {week_num:02d}")
        os.makedirs(week_dir, exist_ok=True)

        for assignment in week_data.get("assignments", []):
            order = assignment["order"]
            name = sanitize_filename(assignment["name"])
            page = assignment["pdf_page"]
            filename = f"{order} - {name}.pdf"
            output_path = os.path.join(week_dir, filename)

            try:
                extract_page(reader, page, output_path)
                print(f"  Extracted: {output_path}")
            except IndexError:
                print(f"  WARNING: Page {page} not found in PDF for '{name}'")


def main():
    parser = argparse.ArgumentParser(description="Extract curriculum assignments from a PDF.")
    parser.add_argument("pdf_file", help="Name of the PDF file (in the same directory as this script)")
    parser.add_argument("--json", default=None, help="Path to the curriculum JSON file (default: grade{N}_curriculum.json)")
    args = parser.parse_args()

    script_dir = Path(__file__).parent.resolve()
    pdf_path = Path(args.pdf_file).resolve()

    if not pdf_path.exists():
        print(f"ERROR: PDF file not found: {pdf_path}")
        sys.exit(1)

    # Load curriculum JSON
    if args.json:
        json_path = Path(args.json).resolve()
    else:
        # Auto-detect: look for grade*_curriculum.json files next to the PDF
        json_files = list(pdf_path.parent.glob("grade*_curriculum.json"))
        if not json_files:
            print("ERROR: No curriculum JSON file found. Use --json to specify one.")
            sys.exit(1)
        if len(json_files) > 1:
            print(f"Multiple JSON files found: {[f.name for f in json_files]}")
            print("Use --json to specify which one to use.")
            sys.exit(1)
        json_path = json_files[0]

    print(f"Using JSON: {json_path}")
    print(f"Using PDF:  {pdf_path}")

    with open(json_path, "r") as f:
        curriculum = json.load(f)

    grade = curriculum["grade"]
    grade_dir = script_dir / f"Grade {grade}"

    print(f"\nCreating output directory: {grade_dir}")
    os.makedirs(grade_dir, exist_ok=True)

    reader = PdfReader(str(pdf_path))
    print(f"PDF has {len(reader.pages)} pages.\n")

    # Academic year
    academic_dir = grade_dir / "Academic Year"
    os.makedirs(academic_dir, exist_ok=True)
    print("Processing Academic Year...")
    process_weeks(reader, curriculum["academic_year"]["weeks"], str(academic_dir))

    # Summer program
    if "summer_program" in curriculum and curriculum["summer_program"]:
        summer_dir = grade_dir / "Summer Program"
        os.makedirs(summer_dir, exist_ok=True)
        print("\nProcessing Summer Program...")
        process_weeks(reader, curriculum["summer_program"]["weeks"], str(summer_dir))

    print("\nDone!")


if __name__ == "__main__":
    main()