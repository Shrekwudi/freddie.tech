"""Grade book

Stores student marks in a dictionary and works out averages and grade bands.
"""

marks = {
    "Alice": [72, 65, 80],
    "Ben": [55, 48, 61],
    "Chloe": [88, 91, 79],
}


def average(values):
    return sum(values) / len(values)


def band(score):
    if score >= 70:
        return "First"
    if score >= 60:
        return "2:1"
    if score >= 50:
        return "2:2"
    if score >= 40:
        return "Third"
    return "Fail"


print(f"{'Student':<8} {'Average':>7}  Band")
print("-" * 24)
for student, scores in marks.items():
    avg = average(scores)
    print(f"{student:<8} {avg:>7.1f}  {band(avg)}")
