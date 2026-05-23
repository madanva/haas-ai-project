"""
Extract all CS courses offered in 2025-2026 from Stanford's Explore Courses.
Requires: pip install explorecourses
"""

from explorecourses import CourseConnection

YEAR = "2025-2026"
CS_DEPT = "CS"

def main():
    connect = CourseConnection()

    print(f"Fetching CS courses for {YEAR}...")
    courses = connect.get_courses_by_department(CS_DEPT, year=YEAR)

    print(f"Found {len(courses)} CS courses\n")
    print(f"{'Code':<12} {'Units':<8} {'Title'}")
    print("-" * 80)

    for course in courses:
        code = f"{course.subject} {course.code}"
        units = course.units_min if course.units_min == course.units_max else f"{course.units_min}-{course.units_max}"
        print(f"{code:<12} {str(units):<8} {course.title}")

    # Save to text file
    output_path = "cs_courses_2025_2026.txt"
    with open(output_path, "w") as f:
        f.write(f"CS Courses at Stanford — {YEAR}\n")
        f.write("=" * 80 + "\n\n")
        for course in courses:
            code = f"{course.subject} {course.code}"
            units = course.units_min if course.units_min == course.units_max else f"{course.units_min}-{course.units_max}"
            f.write(f"{code:<12} {str(units):<8} {course.title}\n")
            if course.description:
                f.write(f"             {course.description.strip()}\n")
            f.write("\n")

    print(f"\nSaved to {output_path}")

if __name__ == "__main__":
    main()
